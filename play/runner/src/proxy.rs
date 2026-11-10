//! The proxy: the website's API (127.0.0.1:4311) and the previews' traffic from Limer
//! (127.0.0.1:4310). It never runs anything itself: the Backend does.

use crate::backend::{ending_note, Backend, Status};
use crate::config::Config;
use crate::http::{
    cookie_values, forward_head, is_websocket_upgrade, parse_request, path_of, query_param,
    read_head, relay_response, response, slot_of, ReadHead, Relayed, RespFilter, MAX_HEAD,
};
use crate::table::{Begin, Table, Why};
use crate::util::{client_keys, ct_eq, html_escape, is_token, new_token};
use serde_json::{json, Value};
use std::io::{self, Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub const MAX_BODY: usize = 4 * 1024 * 1024;
/// Ended sessions' output is kept this long for /log.
pub const KEEP_ENDED: Duration = Duration::from_secs(600);
const LOG_CHUNK: usize = 64 * 1024;
/// A preview connection's threads need little stack: 16 KB buffers at most.
const PREVIEW_STACK: usize = 256 * 1024;

pub struct Proxy {
    pub cfg: Config,
    backend: Arc<dyn Backend>,
    table: Mutex<Table>,
    /// Held while a slot's program is started or stopped, so the two never cross.
    ops: Vec<Mutex<()>>,
    /// Preview connections now, in all and by slot; API connections now (review H2).
    conns: AtomicUsize,
    slot_conns: Vec<AtomicUsize>,
    api_conns: AtomicUsize,
    /// A failure to make a thread or accept is logged once, not on every connection.
    said_spawn: AtomicBool,
    said_accept: AtomicBool,
    /// Set on SIGTERM: no new run starts (second review, item 8).
    stopping: AtomicBool,
}

struct ConnGuard<'a>(&'a AtomicUsize);
impl Drop for ConnGuard<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

/// Takes one place under `max` (Some, freed when dropped) or none (None).
fn take_place(n: &AtomicUsize, max: usize) -> Option<ConnGuard<'_>> {
    if n.fetch_add(1, Ordering::SeqCst) >= max {
        n.fetch_sub(1, Ordering::SeqCst);
        return None;
    }
    Some(ConnGuard(n))
}

fn send(s: &mut TcpStream, bytes: &[u8]) {
    let _ = s.write_all(bytes);
    let _ = s.flush();
}

fn json_answer(status: u16, v: &Value) -> Vec<u8> {
    response(
        status,
        &[("Cache-Control", "no-store".into())],
        "application/json",
        v.to_string().as_bytes(),
    )
}

fn plain(status: u16, text: &str) -> Vec<u8> {
    response(
        status,
        &[("Cache-Control", "no-store".into())],
        "text/plain",
        format!("{}\n", text).as_bytes(),
    )
}

/// When a preview connection last carried a byte, either way, and how long it may carry
/// none (second review, items 3 and 7): before an answer starts, upstream-idle, its clock
/// held while the request's body is still being sent (a slow upload is no idle program);
/// once the answer streams, and for a WebSocket, ws-idle, one clock for both directions.
pub struct Activity {
    base: Instant,
    last_ms: AtomicU64,
    limit_ms: AtomicU64,
    /// A request body is still being sent to the program.
    pub pumping: AtomicBool,
}

impl Activity {
    pub fn new(limit: Duration) -> Activity {
        Activity {
            base: Instant::now(),
            last_ms: AtomicU64::new(0),
            limit_ms: AtomicU64::new(limit.as_millis() as u64),
            pumping: AtomicBool::new(false),
        }
    }
    fn now_ms(&self) -> u64 {
        self.base.elapsed().as_millis() as u64
    }
    pub fn touch(&self) {
        self.last_ms.fetch_max(self.now_ms(), Ordering::SeqCst);
    }
    pub fn set_limit(&self, d: Duration) {
        self.limit_ms.store(d.as_millis() as u64, Ordering::SeqCst);
    }
    /// Whether nothing went either way for the limit; with `wait_for_pump`, never while a
    /// request body is still being sent.
    pub fn expired(&self, wait_for_pump: bool) -> bool {
        if wait_for_pump && self.pumping.load(Ordering::SeqCst) {
            return false;
        }
        let idle = self.now_ms().saturating_sub(self.last_ms.load(Ordering::SeqCst));
        idle >= self.limit_ms.load(Ordering::SeqCst)
    }
}

/// A reader over a socket with a short read timeout: each timeout is waited out until its
/// connection's Activity says it has been idle for its limit; each byte read is activity.
pub struct IdleRead<R> {
    pub inner: R,
    pub act: Arc<Activity>,
    pub wait_for_pump: bool,
}

impl<R: Read> Read for IdleRead<R> {
    fn read(&mut self, b: &mut [u8]) -> io::Result<usize> {
        loop {
            match self.inner.read(b) {
                Ok(n) => {
                    if n > 0 {
                        self.act.touch();
                    }
                    return Ok(n);
                }
                Err(e) if matches!(e.kind(), io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut) => {
                    if self.act.expired(self.wait_for_pump) {
                        return Err(e);
                    }
                }
                Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
                Err(e) => return Err(e),
            }
        }
    }
}

/// What one pull of a program's output found, applied to its log afterwards.
enum Step {
    Skipped(u64, u64),
    Data(Vec<u8>, u64),
}

impl Proxy {
    pub fn new(cfg: Config, backend: Arc<dyn Backend>) -> Arc<Proxy> {
        let n = cfg.slots.len();
        let mut table = Table::new(n, cfg.runs_per_hour, cfg.log_keep);
        table.ended_budget = cfg.ended_budget;
        table.per_net = cfg.per_net;
        Arc::new(Proxy {
            table: Mutex::new(table),
            ops: (0..n).map(|_| Mutex::new(())).collect(),
            conns: AtomicUsize::new(0),
            slot_conns: (0..n).map(|_| AtomicUsize::new(0)).collect(),
            api_conns: AtomicUsize::new(0),
            said_spawn: AtomicBool::new(false),
            said_accept: AtomicBool::new(false),
            stopping: AtomicBool::new(false),
            cfg,
            backend,
        })
    }

    /// How often a waiting read looks at its connection's Activity: a quarter of the
    /// shortest idle limit, between 50 ms and 1 s.
    fn tick(&self) -> Duration {
        (self.cfg.upstream_idle.min(self.cfg.ws_idle) / 4)
            .clamp(Duration::from_millis(50), Duration::from_secs(1))
    }

    fn say_once(flag: &AtomicBool, what: &str) {
        if !flag.swap(true, Ordering::SeqCst) {
            eprintln!("quillo-play: {} (said once)", what);
        }
    }

    /// Accepts on `l`, each connection on a thread of its own made with `stack` (0: the
    /// default). An accept that fails waits 100 ms (out of descriptors: no spinning); a
    /// thread that cannot be made drops that one connection and the loop goes on (review H2).
    fn accept_loop(
        self: Arc<Self>,
        l: TcpListener,
        stack: usize,
        serve: fn(&Proxy, TcpStream),
    ) {
        for c in l.incoming() {
            let c = match c {
                Ok(c) => c,
                Err(e) => {
                    Proxy::say_once(&self.said_accept, &format!("accept: {}", e));
                    std::thread::sleep(Duration::from_millis(100));
                    continue;
                }
            };
            let p = self.clone();
            let mut b = std::thread::Builder::new();
            if stack > 0 {
                b = b.stack_size(stack);
            }
            if let Err(e) = b.spawn(move || serve(&p, c)) {
                Proxy::say_once(&self.said_spawn, &format!("no thread for a connection: {}", e));
                std::thread::sleep(Duration::from_millis(10));
            }
        }
    }

    /// Serves the API and the previews on these listeners, and ends sessions on time,
    /// each on threads of its own; returns at once.
    pub fn start(self: &Arc<Self>, api: TcpListener, preview: TcpListener) {
        let p = self.clone();
        std::thread::spawn(move || p.accept_loop(api, 0, |p, c| p.api_conn(c)));
        let p = self.clone();
        std::thread::spawn(move || p.accept_loop(preview, PREVIEW_STACK, |p, c| p.preview_conn(c)));
        let p = self.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_secs(2));
            p.reap();
        });
    }

    // ---- pages a preview host shows itself ------------------------------------------

    fn page(&self, status: u16, title: &str, text: &str) -> Vec<u8> {
        let ide = html_escape(&self.cfg.ide_url);
        let shown = html_escape(
            self.cfg
                .ide_url
                .trim_start_matches("https://")
                .trim_start_matches("http://"),
        );
        let body = format!(
            "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>{t}</title>\
<style>body{{font:16px/1.5 system-ui,sans-serif;margin:3rem auto;max-width:34rem;padding:0 1rem;color:#1d1d1f;background:#fff}}a{{color:#0b57d0}}\
@media (prefers-color-scheme:dark){{body{{color:#e8e8ea;background:#151517}}a{{color:#8ab4ff}}}}</style>\
<h1>{t}</h1><p>{x} <a href=\"{ide}\" target=\"_top\">{shown}</a>.</p></html>",
            t = html_escape(title),
            x = html_escape(text),
        );
        response(
            status,
            &[
                ("Cache-Control", "no-store".into()),
                ("X-Content-Type-Options", "nosniff".into()),
                ("Referrer-Policy", "no-referrer".into()),
            ],
            "text/html; charset=utf-8",
            body.as_bytes(),
        )
    }

    fn ended_page(&self) -> Vec<u8> {
        self.page(404, "This preview has ended", "Run the program again on")
    }

    fn forbidden_page(&self) -> Vec<u8> {
        self.page(
            403,
            "This preview belongs to another session",
            "Open it from the editor that ran it, or run the program again on",
        )
    }

    fn not_answering_page(&self) -> Vec<u8> {
        self.page(
            502,
            "The program is not answering",
            "It may still be starting, or it has stopped: see Output in the editor on",
        )
    }

    // ---- previews -------------------------------------------------------------------

    /// /__play/enter?t=E and /__play/enter2?t=E, E the enter token /run gave: the first
    /// clears what an earlier session left on this host, the second uses E up and sets the
    /// session's cookie. Only in a frame (a browser that says where a request goes must say
    /// "iframe"); E works once, within enter-ttl (review L4).
    fn enter(&self, c: &mut TcpStream, slot: usize, head: &crate::http::Head, second: bool) {
        if head
            .get("sec-fetch-dest")
            .is_some_and(|d| !d.eq_ignore_ascii_case("iframe"))
        {
            return send(c, &self.forbidden_page());
        }
        let given = query_param(&head.target, "t").unwrap_or("");
        if !is_token(given) {
            return send(c, &self.forbidden_page());
        }
        let now = Instant::now();
        let token = {
            let mut t = self.table.lock().unwrap();
            if !t.check_enter(slot, given, now, self.cfg.enter_ttl, second) {
                None
            } else {
                if second {
                    t.touch(slot, now);
                }
                t.token_of(slot).map(String::from)
            }
        };
        let Some(token) = token else {
            return send(c, &self.forbidden_page());
        };
        if !second {
            // the last session's storage and cache on this host go ("cookies" would clear
            // all of quillolang.org's, so it is not asked for)
            return send(
                c,
                &response(
                    302,
                    &[
                        ("Location", format!("/__play/enter2?t={}", given)),
                        ("Clear-Site-Data", "\"cache\", \"storage\"".into()),
                        ("Cache-Control", "no-store".into()),
                        ("Referrer-Policy", "no-referrer".into()),
                    ],
                    "",
                    b"",
                ),
            );
        }
        let secure = if self.cfg.cookie_secure {
            "; Secure"
        } else {
            ""
        };
        send(
            c,
            &response(
                302,
                &[
                    ("Location", "/".into()),
                    (
                        "Set-Cookie",
                        format!(
                            "{}={}; Path=/; HttpOnly; SameSite=Lax{}",
                            self.cfg.cookie, token, secure
                        ),
                    ),
                    ("Cache-Control", "no-store".into()),
                    ("Referrer-Policy", "no-referrer".into()),
                ],
                "",
                b"",
            ),
        );
    }

    fn preview_conn(&self, mut c: TcpStream) {
        let Some(_g) = take_place(&self.conns, self.cfg.max_preview_conns) else {
            return send(&mut c, &plain(503, "too many connections"));
        };
        let peer = c.peer_addr().ok();
        let _ = c.set_read_timeout(Some(Duration::from_secs(15)));
        let _ = c.set_write_timeout(Some(Duration::from_secs(60)));
        let (raw, rest) = match read_head(&mut c, MAX_HEAD) {
            ReadHead::Head(h, r) => (h, r),
            ReadHead::TooLarge => return send(&mut c, &plain(431, "the request head is too large")),
            ReadHead::Closed => return,
        };
        let head = match parse_request(&raw) {
            Ok(h) => h,
            Err(e) => return send(&mut c, &plain(400, e)),
        };
        let host = head.get("host").unwrap_or("");
        let Some(slot) = slot_of(host, &self.cfg.host_suffix, &self.cfg.slots) else {
            return send(&mut c, &self.ended_page());
        };
        let Some(_sg) = take_place(&self.slot_conns[slot], self.cfg.max_slot_conns) else {
            return send(&mut c, &plain(503, "too many connections to this preview"));
        };
        let token = self.table.lock().unwrap().token_of(slot).map(String::from);
        let Some(token) = token else {
            return send(&mut c, &self.ended_page());
        };
        match path_of(&head.target) {
            "/__play/enter" => return self.enter(&mut c, slot, &head, false),
            "/__play/enter2" => return self.enter(&mut c, slot, &head, true),
            p if p == "/__play" || p.starts_with("/__play/") => {
                return send(&mut c, &plain(404, "not found"))
            }
            _ => {}
        }
        // no service worker on a preview host: one would outlive its session and see the
        // next session's enter link on this host before the network does (review M2)
        if head.get("service-worker").is_some() {
            return send(&mut c, &plain(403, "no service workers on a preview"));
        }
        let ok = cookie_values(&head, &self.cfg.cookie)
            .iter()
            .any(|v| ct_eq(v.as_bytes(), token.as_bytes()));
        if !ok {
            return send(&mut c, &self.forbidden_page());
        }
        self.table.lock().unwrap().touch(slot, Instant::now());
        let upgrade = is_websocket_upgrade(&head);
        // the body: as long as Content-Length says and no longer; what comes after it (a
        // second request) is not sent on (review L2)
        if head.get("transfer-encoding").is_some() {
            return send(&mut c, &plain(411, "send a Content-Length"));
        }
        let len: u64 = head
            .get("content-length")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        if upgrade && len > 0 {
            return send(&mut c, &plain(400, "a WebSocket request has no body"));
        }
        let first_body = &rest[..(len.min(rest.len() as u64) as usize)];
        let remaining = len - first_body.len() as u64;
        let xff = if self.cfg.xff_from_peer {
            peer.map(|p| p.ip().to_string())
        } else {
            None
        };
        let fwd = forward_head(&head, &self.cfg.cookie, upgrade, xff.as_deref());
        let filter = RespFilter {
            cookie: &self.cfg.cookie,
            frame: &self.cfg.frame_ancestors,
            upgrade,
            head_request: head.method == "HEAD",
        };
        // A request with no body may be sent again when the program closed without a
        // byte of answer (quillo does so now and then under load); one with a body may not.
        let bodyless = matches!(head.method.as_str(), "GET" | "HEAD") && len == 0 && !upgrade;
        let mut tries = if bodyless { 2 } else { 1 };
        let name = &self.cfg.slots[slot];
        let tick = self.tick();
        loop {
            tries -= 1;
            let mut up = match self.backend.connect(name) {
                Ok(u) => u,
                Err(e) => {
                    eprintln!("quillo-play: {}: cannot reach the program: {}", name, e);
                    return send(&mut c, &self.not_answering_page());
                }
            };
            let _ = up.set_read_timeout(Some(tick));
            let _ = up.set_write_timeout(Some(Duration::from_secs(60)));
            if let Err(e) = up.write_all(&fwd).and_then(|_| up.write_all(first_body)) {
                eprintln!("quillo-play: {}: cannot write to the program: {}", name, e);
                return send(&mut c, &self.not_answering_page());
            }
            let act = Arc::new(Activity::new(self.cfg.upstream_idle));
            act.touch();
            let mut first = vec![0u8; 16384];
            let mut got = 0;
            if bodyless {
                // the client has nothing more to send before the answer: wait for its first bytes
                let mut r = IdleRead {
                    inner: &mut up,
                    act: act.clone(),
                    wait_for_pump: true,
                };
                got = r.read(&mut first).unwrap_or(0);
                if got == 0 {
                    if tries > 0 {
                        eprintln!("quillo-play: {}: the program closed without an answer; sending the request again", name);
                        continue;
                    }
                    eprintln!("quillo-play: {}: no answer from the program", name);
                    return send(&mut c, &self.not_answering_page());
                }
            }
            first.truncate(got);
            // the rest of the body, as it comes, and no more than it said; the idle clock
            // waits until it is all sent
            let body_pump = if remaining > 0 {
                let _ = c.set_read_timeout(Some(tick));
                let (Ok(c2), Ok(mut up2)) = (c.try_clone(), up.try_clone()) else {
                    return send(&mut c, &self.not_answering_page());
                };
                act.pumping.store(true, Ordering::SeqCst);
                let a2 = act.clone();
                match std::thread::Builder::new()
                    .stack_size(PREVIEW_STACK)
                    .spawn(move || {
                        let mut from = IdleRead {
                            inner: c2,
                            act: a2.clone(),
                            wait_for_pump: false,
                        }
                        .take(remaining);
                        let _ = io::copy(&mut from, &mut up2);
                        a2.touch();
                        a2.pumping.store(false, Ordering::SeqCst);
                    }) {
                    Ok(h) => Some(h),
                    Err(e) => {
                        Proxy::say_once(&self.said_spawn, &format!("no thread for a body: {}", e));
                        return send(&mut c, &plain(503, "busy"));
                    }
                }
            } else {
                None
            };
            let mut sent = false;
            let r = {
                let mut from = (&first[..]).chain(IdleRead {
                    inner: &mut up,
                    act: act.clone(),
                    wait_for_pump: true,
                });
                relay_response(
                    &mut from,
                    &mut CountingWriter {
                        inner: &mut c,
                        sent: &mut sent,
                        streaming: Some((&act, self.cfg.ws_idle)),
                    },
                    &filter,
                )
            };
            if let Ok(Relayed::Upgraded) = r {
                // a WebSocket: both ways, on one clock: it ends when neither way has carried a
                // byte for ws-idle (second review, item 7)
                act.set_limit(self.cfg.ws_idle);
                act.touch();
                let _ = c.set_read_timeout(Some(tick));
                if let (Ok(c2), Ok(mut up2)) = (c.try_clone(), up.try_clone()) {
                    let a2 = act.clone();
                    let spawned = std::thread::Builder::new()
                        .stack_size(PREVIEW_STACK)
                        .spawn(move || {
                            let mut from = IdleRead {
                                inner: c2,
                                act: a2,
                                wait_for_pump: false,
                            };
                            let _ = io::copy(&mut from, &mut up2);
                            let _ = up2.shutdown(Shutdown::Write);
                        });
                    match spawned {
                        Ok(h) => {
                            // what came with the 101 is sent already; the rest, as it comes
                            let mut from = IdleRead {
                                inner: &mut up,
                                act: act.clone(),
                                wait_for_pump: false,
                            };
                            let _ = io::copy(&mut from, &mut c);
                            let _ = c.shutdown(Shutdown::Both);
                            let _ = up.shutdown(Shutdown::Both);
                            let _ = h.join();
                        }
                        Err(e) => Proxy::say_once(
                            &self.said_spawn,
                            &format!("no thread for a WebSocket: {}", e),
                        ),
                    }
                }
            } else if !sent && !matches!(r, Ok(Relayed::Done)) {
                eprintln!("quillo-play: {}: no answer from the program: {:?}", name, r);
                send(&mut c, &self.not_answering_page());
            }
            let _ = c.shutdown(Shutdown::Both);
            let _ = up.shutdown(Shutdown::Both);
            if let Some(h) = body_pump {
                let _ = h.join();
            }
            return;
        }
    }

    // ---- the website's API ----------------------------------------------------------

    fn api_conn(&self, mut s: TcpStream) {
        let Some(_g) = take_place(&self.api_conns, self.cfg.max_api_conns) else {
            return send(&mut s, &json_answer(503, &json!({"error": "too many connections"})));
        };
        let _ = s.set_read_timeout(Some(Duration::from_secs(15)));
        let _ = s.set_write_timeout(Some(Duration::from_secs(30)));
        let (raw, mut body) = match read_head(&mut s, MAX_HEAD) {
            ReadHead::Head(h, r) => (h, r),
            ReadHead::TooLarge => {
                return send(
                    &mut s,
                    &json_answer(431, &json!({"error": "the request head is too large"})),
                )
            }
            ReadHead::Closed => return,
        };
        let head = match parse_request(&raw) {
            Ok(h) => h,
            Err(e) => return send(&mut s, &json_answer(400, &json!({"error": e}))),
        };
        let want = format!("Bearer {}", self.cfg.secret);
        if !ct_eq(
            head.get("authorization").unwrap_or("").as_bytes(),
            want.as_bytes(),
        ) {
            return send(&mut s, &json_answer(401, &json!({"error": "unauthorized"})));
        }
        if head.get("transfer-encoding").is_some() {
            return send(
                &mut s,
                &json_answer(411, &json!({"error": "send a Content-Length"})),
            );
        }
        let len: usize = head
            .get("content-length")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        if len > MAX_BODY {
            return send(
                &mut s,
                &json_answer(413, &json!({"error": "the body is too large"})),
            );
        }
        let mut chunk = [0u8; 16384];
        while body.len() < len {
            match s.read(&mut chunk) {
                Ok(0) | Err(_) => return,
                Ok(n) => body.extend_from_slice(&chunk[..n]),
            }
        }
        body.truncate(len);
        let path = path_of(&head.target);
        let (status, v) = match (head.method.as_str(), path) {
            ("POST", "/run") => self.api_run(&body),
            ("GET", "/log") => self.api_log(&head.target),
            ("POST", "/stop") => self.api_stop(&body),
            ("GET", "/health") => {
                let t = self.table.lock().unwrap();
                (
                    200,
                    json!({"slots": self.cfg.slots.len(), "busy": t.busy()}),
                )
            }
            (_, "/run" | "/log" | "/stop" | "/health") => {
                (405, json!({"error": "method not allowed"}))
            }
            _ => (404, json!({"error": "not found"})),
        };
        send(&mut s, &json_answer(status, &v));
    }

    /// Reads what the slot's program printed since the last time, into its session's log
    /// (when it still has `token`). The spawner is asked with no lock held, and what it
    /// said is applied only if no other pull got there first (review M6: a slow spawner
    /// answer never holds up previews, which need the table for every request).
    fn pull(&self, slot: usize, token: &str) {
        let name = &self.cfg.slots[slot];
        let keep = self.cfg.log_keep as u64;
        let off = {
            let t = self.table.lock().unwrap();
            match t.slots[slot].as_ref() {
                Some(s) if !s.starting && ct_eq(s.token.as_bytes(), token.as_bytes()) => {
                    s.log.offset
                }
                _ => return,
            }
        };
        let mut steps = Vec::new();
        let mut at = off;
        for _ in 0..8 {
            let Ok(c) = self.backend.log(name, at, LOG_CHUNK) else {
                break;
            };
            if c.size > at && c.size - at > keep {
                let to = c.size - keep;
                steps.push(Step::Skipped(to - at, to));
                at = to;
                continue;
            }
            if c.data.is_empty() {
                break;
            }
            at = c.next;
            let done = c.next >= c.size;
            steps.push(Step::Data(c.data, c.next));
            if done {
                break;
            }
        }
        if steps.is_empty() {
            return;
        }
        let mut t = self.table.lock().unwrap();
        if !t.holds(slot, token) {
            return;
        }
        let s = t.slots[slot].as_mut().unwrap();
        if s.starting || s.log.offset != off {
            return;
        }
        for st in steps {
            match st {
                Step::Skipped(n, to) => {
                    s.log.skipped(n);
                    s.log.offset = to;
                }
                Step::Data(d, next) => {
                    s.log.push(&d);
                    s.log.offset = next;
                }
            }
        }
    }

    /// Whether quillo --watch has said it is watching with no socket made: the program
    /// did not start (an error, printed above), and waits for its files to change.
    fn waits_for_a_fix(&self, name: &str) -> bool {
        self.backend
            .log(name, 0, LOG_CHUNK)
            .is_ok_and(|c| waits_for_a_fix_in(&String::from_utf8_lossy(&c.data)))
    }

    fn status_of(&self, name: &str) -> Status {
        self.backend
            .status(&[name.to_string()])
            .remove(name)
            .unwrap_or_else(Status::gone)
    }

    /// Ends a slot's session (when it still has `token`): its last output read, its
    /// program stopped, `note` (or how it ended) after its output. With `only_if_ended`,
    /// nothing happens while the program still runs.
    fn finish(&self, slot: usize, token: &str, note: Option<String>, only_if_ended: bool) {
        let _op = self.ops[slot].lock().unwrap();
        {
            let t = self.table.lock().unwrap();
            if !t.holds(slot, token) {
                return;
            }
            if only_if_ended && t.slots[slot].as_ref().is_none_or(|s| s.starting) {
                return;
            }
        }
        self.pull(slot, token);
        let name = self.cfg.slots[slot].clone();
        let st = self.status_of(&name);
        if only_if_ended && st.running {
            return;
        }
        if !self.table.lock().unwrap().holds(slot, token) {
            return;
        }
        self.pull(slot, token);
        self.backend.stop(&name);
        let note = note.unwrap_or_else(|| ending_note(&st, &self.cfg.memory_max));
        let exit = if st.running { None } else { st.exit };
        self.table
            .lock()
            .unwrap()
            .end(slot, token, exit, Some(&note), Instant::now());
    }

    fn reap(&self) {
        let now = Instant::now();
        type Running = Vec<(usize, String)>;
        let (expired, running, free): (Vec<(usize, String, Why)>, Running, Vec<usize>) = {
            let mut t = self.table.lock().unwrap();
            t.prune(now, KEEP_ENDED);
            let running = t
                .slots
                .iter()
                .enumerate()
                .filter_map(|(i, s)| {
                    s.as_ref()
                        .filter(|s| !s.starting)
                        .map(|s| (i, s.token.clone()))
                })
                .collect();
            let free = (0..t.slots.len()).filter(|i| t.slots[*i].is_none()).collect();
            (
                t.expired(now, self.cfg.max_runtime, self.cfg.idle),
                running,
                free,
            )
        };
        for (slot, token, why) in &expired {
            let note = match why {
                Why::TooLong => format!(
                    "[stopped: a run may take at most {} minutes]",
                    self.cfg.max_runtime.as_secs() / 60
                ),
                Why::Idle => format!(
                    "[stopped: nothing asked for it for {} minutes]",
                    self.cfg.idle.as_secs() / 60
                ),
            };
            self.finish(*slot, token, Some(note), false);
        }
        let names: Vec<String> = running
            .iter()
            .map(|(i, _)| *i)
            .chain(free.iter().copied())
            .map(|i| self.cfg.slots[i].clone())
            .collect();
        if names.is_empty() {
            return;
        }
        let st = self.backend.status(&names);
        for (slot, token) in running {
            if expired.iter().any(|(s, _, _)| *s == slot) {
                continue;
            }
            if st.get(&self.cfg.slots[slot]).is_some_and(|s| !s.running) {
                self.finish(slot, &token, None, true);
            }
        }
        // a program running in a slot no session holds (a start that timed out here but went
        // on in the spawner): stopped (review L5)
        for slot in free {
            let name = &self.cfg.slots[slot];
            if st.get(name).is_some_and(|s| s.running) {
                let _op = self.ops[slot].lock().unwrap();
                if self.table.lock().unwrap().slots[slot].is_none() {
                    eprintln!("quillo-play: {}: a program no session holds was running; stopped", name);
                    self.backend.stop(name);
                }
            }
        }
    }

    fn api_run(&self, body: &[u8]) -> (u16, Value) {
        let v: Value = match serde_json::from_slice(body) {
            Ok(v) => v,
            Err(_) => return (400, json!({"error": "the body is not JSON"})),
        };
        let files = match crate::files::validate(v.get("files").unwrap_or(&Value::Null)) {
            Ok(f) => f,
            Err(e) => return (400, json!({"error": e})),
        };
        let client = v.get("client").and_then(|c| c.as_str()).unwrap_or("");
        if client.is_empty() || client.len() > 128 || client.chars().any(|c| c.is_control()) {
            return (
                400,
                json!({"error": "`client` names who runs: u12 or ip:1.2.3.4"}),
            );
        }
        if self.stopping.load(Ordering::SeqCst) {
            return (503, json!({"error": "the runner is stopping; try again in a minute"}));
        }
        // the session is the exact address; the hourly limit and the cap on sessions at once
        // count its network, an IPv6 /64 (second review, item 4)
        let (client, net) = client_keys(client);
        let token = match new_token() {
            Ok(t) => t,
            Err(e) => return (500, json!({"error": format!("no token: {}", e)})),
        };
        let now = Instant::now();
        let slot = {
            let mut t = self.table.lock().unwrap();
            match t.begin_in(&client, &net, token.clone(), now) {
                Begin::TooMany => {
                    return (
                        429,
                        json!({"error": format!("too many runs: at most {} an hour; try again later", self.cfg.runs_per_hour)}),
                    )
                }
                Begin::Busy => {
                    return (
                        503,
                        json!({"error": "busy: every sandbox is taken; try again in a minute"}),
                    )
                }
                Begin::NetFull => {
                    return (
                        429,
                        json!({"error": format!("too many runs from your network: at most {} at once; stop one, or try again in a few minutes", self.cfg.per_net)}),
                    )
                }
                Begin::Slot { slot, replaced } => {
                    if let Some(old) = replaced {
                        t.keep_ended(
                            old,
                            None,
                            Some("[stopped: a newer run took its place]"),
                            now,
                        );
                    }
                    slot
                }
            }
        };
        let name = self.cfg.slots[slot].clone();
        let op = self.ops[slot].lock().unwrap();
        if !self.table.lock().unwrap().holds(slot, &token) {
            return (409, json!({"error": "a newer run took its place"}));
        }
        // stopping began while this run waited for its slot: it does not start
        if self.stopping.load(Ordering::SeqCst) {
            let mut t = self.table.lock().unwrap();
            if t.holds(slot, &token) {
                t.slots[slot] = None;
            }
            return (503, json!({"error": "the runner is stopping; try again in a minute"}));
        }
        if let Err(e) = self.backend.start(&name, &files) {
            // it may have started all the same (the answer timed out here): stop it (review L5)
            self.backend.stop(&name);
            let mut t = self.table.lock().unwrap();
            if t.holds(slot, &token) {
                t.slots[slot] = None;
            }
            return (500, json!({"error": e}));
        }
        let deadline = Instant::now() + self.cfg.ready_wait;
        let mut st = Status {
            running: true,
            exit: None,
            result: None,
        };
        loop {
            if self.backend.connect(&name).is_ok() {
                break;
            }
            st = self.status_of(&name);
            if !st.running || Instant::now() >= deadline || self.waits_for_a_fix(&name) {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        {
            let mut t = self.table.lock().unwrap();
            if !t.holds(slot, &token) {
                return (409, json!({"error": "a newer run took its place"}));
            }
            if let Some(s) = t.slots[slot].as_mut() {
                s.starting = false;
            }
        }
        self.pull(slot, &token);
        drop(op);
        if !st.running {
            self.finish(slot, &token, None, true);
        }
        // the link that lets this browser in, once, from now (review L4); /run is the only
        // answer it is ever in
        let enter = new_token().unwrap_or_default();
        let mut t = self.table.lock().unwrap();
        let entered = !enter.is_empty() && t.set_enter(slot, &token, enter.clone(), Instant::now());
        let (log, next, running, exit) = if t.holds(slot, &token) {
            let (l, n) = t.slots[slot]
                .as_ref()
                .unwrap()
                .log
                .to_json(0, self.cfg.log_answer);
            (l, n, true, None)
        } else if let Some(e) = t.ended.get(&token) {
            let (l, n) = e.log.to_json(0, self.cfg.log_answer);
            (l, n, false, e.exit)
        } else {
            (json!([]), 0, false, None)
        };
        (
            200,
            json!({
                "session": token,
                "host": self.cfg.host(&name),
                "enter": if entered { format!("{}/__play/enter?t={}", self.cfg.origin(&name), enter) } else { String::new() },
                "log": log,
                "next": next,
                "running": running,
                "exit": exit,
            }),
        )
    }

    fn api_log(&self, target: &str) -> (u16, Value) {
        let session = query_param(target, "session").unwrap_or("");
        let after: u64 = query_param(target, "after")
            .and_then(|a| a.parse().ok())
            .unwrap_or(0);
        if !is_token(session) {
            return (404, json!({"error": "no such session"}));
        }
        let slot = {
            let mut t = self.table.lock().unwrap();
            let slot = t.by_token(session);
            if let Some(s) = slot {
                t.touch(s, Instant::now());
            }
            slot
        };
        if let Some(slot) = slot {
            self.pull(slot, session);
            let t = self.table.lock().unwrap();
            if t.holds(slot, session) {
                let (lines, next) = t.slots[slot]
                    .as_ref()
                    .unwrap()
                    .log
                    .to_json(after, self.cfg.log_answer);
                return (
                    200,
                    json!({"lines": lines, "running": true, "exit": null, "next": next}),
                );
            }
        }
        let t = self.table.lock().unwrap();
        let found = t
            .ended
            .iter()
            .find(|(k, _)| ct_eq(k.as_bytes(), session.as_bytes()))
            .map(|(_, e)| e);
        if let Some(e) = found {
            let (lines, next) = e.log.to_json(after, self.cfg.log_answer);
            return (
                200,
                json!({"lines": lines, "running": false, "exit": e.exit, "next": next}),
            );
        }
        (404, json!({"error": "no such session"}))
    }

    fn api_stop(&self, body: &[u8]) -> (u16, Value) {
        let v: Value = match serde_json::from_slice(body) {
            Ok(v) => v,
            Err(_) => return (400, json!({"error": "the body is not JSON"})),
        };
        let session = v.get("session").and_then(|s| s.as_str()).unwrap_or("");
        if !is_token(session) {
            return (200, json!({}));
        }
        let slot = self.table.lock().unwrap().by_token(session);
        if let Some(slot) = slot {
            self.finish(slot, session, Some("[stopped]".into()), false);
        }
        (200, json!({}))
    }

    /// Stops every slot (at start: whatever an earlier proxy left running), each under its
    /// slot's lock, so a start in progress finishes first and is then stopped.
    pub fn stop_every_slot(&self) {
        for (i, s) in self.cfg.slots.iter().enumerate() {
            let _op = self.ops[i].lock().unwrap_or_else(|e| e.into_inner());
            self.backend.stop(s);
        }
    }

    /// On SIGTERM: no new run starts (/run answers 503), then every slot is stopped, after any
    /// start in progress (second review, item 8).
    pub fn shut_down(&self) {
        self.stopping.store(true, Ordering::SeqCst);
        self.stop_every_slot();
    }
}

/// A writer that notes whether anything was written. With `streaming`, the first bytes (the
/// answer's head) give the connection's Activity its streaming limit: an answer that has
/// started may go quiet for longer than one that has not (an event stream).
struct CountingWriter<'a, W: Write> {
    inner: &'a mut W,
    sent: &'a mut bool,
    streaming: Option<(&'a Activity, Duration)>,
}

impl<W: Write> Write for CountingWriter<'_, W> {
    fn write(&mut self, b: &[u8]) -> io::Result<usize> {
        let n = self.inner.write(b)?;
        if n > 0 {
            if !*self.sent {
                if let Some((a, limit)) = self.streaming {
                    a.set_limit(limit);
                }
            }
            *self.sent = true;
            if let Some((a, _)) = self.streaming {
                a.touch();
            }
        }
        Ok(n)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

/// Whether quillo, under --watch, is waiting for a fix rather than serving: it said "watching
/// for changes" and never that it is listening. A program that is listening has its socket up,
/// though a connect may still be held back for a moment by the spawner's 250 ms memory of a
/// failed one (seen on the server: /run answered while that memory turned the first preview
/// request away with 502); then the wait goes on until the connect succeeds.
fn waits_for_a_fix_in(output: &str) -> bool {
    let mut watching = false;
    for l in output.lines() {
        let l = l.trim_end();
        if l.contains(" listening on unix:") || l.contains(" listening on http") {
            return false;
        }
        if l.ends_with("watching for changes") {
            watching = true;
        }
    }
    watching
}

#[cfg(test)]
mod tests {
    #[test]
    fn a_program_that_listens_is_not_waiting_for_a_fix() {
        use super::waits_for_a_fix_in as w;
        assert!(w("main.qwe:2: error: unknown name `b`\nquillo: watching for changes\n"));
        assert!(!w("quillo: 2 routes listening on unix:/work/app.sock\nquillo: watching for changes\n"));
        assert!(!w("quillo: 256 file descriptors allowed\nquillo: 1 route listening on unix:app.sock\nquillo: watching for changes\n"));
        assert!(!w("quillo: 2 routes listening on unix:/work/app.sock\n"));
        assert!(!w(""));
        // a program that prints the words itself is not quillo saying them
        assert!(w("watching for changes\n"));
    }
    use super::*;

    /// Times out `waits` times, then gives `data`, then ends.
    struct Quiet {
        waits: usize,
        data: Vec<u8>,
        sleep: Duration,
    }
    impl Read for Quiet {
        fn read(&mut self, b: &mut [u8]) -> io::Result<usize> {
            if self.waits > 0 {
                self.waits -= 1;
                std::thread::sleep(self.sleep);
                return Err(io::Error::new(io::ErrorKind::WouldBlock, "timed out"));
            }
            let n = self.data.len().min(b.len());
            b[..n].copy_from_slice(&self.data[..n]);
            self.data.drain(..n);
            Ok(n)
        }
    }

    #[test]
    fn a_read_waits_out_timeouts_until_the_connection_is_idle_for_its_limit() {
        let act = Arc::new(Activity::new(Duration::from_millis(200)));
        act.touch();
        // short waits, well inside the limit: the data comes through
        let mut r = IdleRead {
            inner: Quiet { waits: 3, data: b"hi".to_vec(), sleep: Duration::from_millis(20) },
            act: act.clone(),
            wait_for_pump: false,
        };
        let mut b = [0u8; 8];
        assert_eq!(r.read(&mut b).unwrap(), 2);
        // nothing for longer than the limit: the timeout comes out
        let mut r = IdleRead {
            inner: Quiet { waits: 100, data: vec![], sleep: Duration::from_millis(20) },
            act: act.clone(),
            wait_for_pump: false,
        };
        let t = Instant::now();
        let e = r.read(&mut b).unwrap_err();
        assert_eq!(e.kind(), io::ErrorKind::WouldBlock);
        assert!(t.elapsed() >= Duration::from_millis(150) && t.elapsed() < Duration::from_secs(2), "{:?}", t.elapsed());
    }

    #[test]
    fn the_clock_waits_while_a_body_is_sent_and_counts_both_ways() {
        // second review, item 3: a slow upload is no idle program
        let act = Arc::new(Activity::new(Duration::from_millis(100)));
        act.touch();
        act.pumping.store(true, Ordering::SeqCst);
        std::thread::sleep(Duration::from_millis(150));
        assert!(!act.expired(true), "held while the body is sent");
        assert!(act.expired(false), "the body's own reader is not held");
        act.pumping.store(false, Ordering::SeqCst);
        assert!(act.expired(true));
        act.touch();
        assert!(!act.expired(true), "counted from the body's last byte");
        // item 7: activity either way keeps the other way's read alive
        let act = Arc::new(Activity::new(Duration::from_millis(200)));
        act.touch();
        let a2 = act.clone();
        let other_way = std::thread::spawn(move || {
            for _ in 0..8 {
                std::thread::sleep(Duration::from_millis(60));
                a2.touch();
            }
        });
        let mut r = IdleRead {
            inner: Quiet { waits: 20, data: b"late".to_vec(), sleep: Duration::from_millis(25) },
            act: act.clone(),
            wait_for_pump: false,
        };
        let mut b = [0u8; 8];
        assert_eq!(r.read(&mut b).unwrap(), 4, "500 ms of silence this way, but not both ways");
        other_way.join().unwrap();
        // a longer limit once the answer streams
        let act = Activity::new(Duration::from_millis(50));
        act.touch();
        act.set_limit(Duration::from_secs(60));
        std::thread::sleep(Duration::from_millis(80));
        assert!(!act.expired(false));
    }
}
