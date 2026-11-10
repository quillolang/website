//! The proxy: the website's API (127.0.0.1:4311) and the previews' traffic from Limer
//! (127.0.0.1:4310). It never runs anything itself: the Backend does.

use crate::backend::{ending_note, Backend, Status};
use crate::config::Config;
use crate::http::{
    cookie_values, forward_head, is_websocket_upgrade, parse_request, path_of, query_param,
    read_head, relay_response, response, slot_of, ReadHead, MAX_HEAD,
};
use crate::table::{Begin, Table, Why};
use crate::util::{ct_eq, html_escape, is_token, new_token};
use serde_json::{json, Value};
use std::io::{self, Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub const MAX_BODY: usize = 4 * 1024 * 1024;
pub const MAX_CONNECTIONS: usize = 1024;
/// Ended sessions' output is kept this long for /log.
pub const KEEP_ENDED: Duration = Duration::from_secs(600);
const LOG_CHUNK: usize = 64 * 1024;

pub struct Proxy {
    pub cfg: Config,
    backend: Arc<dyn Backend>,
    table: Mutex<Table>,
    /// Held while a slot's program is started or stopped, so the two never cross.
    ops: Vec<Mutex<()>>,
    conns: AtomicUsize,
}

struct ConnGuard<'a>(&'a AtomicUsize);
impl Drop for ConnGuard<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
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

impl Proxy {
    pub fn new(cfg: Config, backend: Arc<dyn Backend>) -> Arc<Proxy> {
        let n = cfg.slots.len();
        Arc::new(Proxy {
            table: Mutex::new(Table::new(n, cfg.runs_per_hour, cfg.log_keep)),
            ops: (0..n).map(|_| Mutex::new(())).collect(),
            conns: AtomicUsize::new(0),
            cfg,
            backend,
        })
    }

    /// Serves the API and the previews on these listeners, and ends sessions on time,
    /// each on threads of its own; returns at once.
    pub fn start(self: &Arc<Self>, api: TcpListener, preview: TcpListener) {
        let p = self.clone();
        std::thread::spawn(move || {
            for c in api.incoming().flatten() {
                let p = p.clone();
                std::thread::spawn(move || p.api_conn(c));
            }
        });
        let p = self.clone();
        std::thread::spawn(move || {
            for c in preview.incoming().flatten() {
                let p = p.clone();
                std::thread::spawn(move || p.preview_conn(c));
            }
        });
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

    fn preview_conn(&self, mut c: TcpStream) {
        if self.conns.fetch_add(1, Ordering::SeqCst) >= MAX_CONNECTIONS {
            self.conns.fetch_sub(1, Ordering::SeqCst);
            send(
                &mut c,
                &response(503, &[], "text/plain", b"too many connections\n"),
            );
            return;
        }
        let _g = ConnGuard(&self.conns);
        let peer = c.peer_addr().ok();
        let _ = c.set_read_timeout(Some(Duration::from_secs(15)));
        let _ = c.set_write_timeout(Some(Duration::from_secs(60)));
        let (raw, rest) = match read_head(&mut c, MAX_HEAD) {
            ReadHead::Head(h, r) => (h, r),
            ReadHead::TooLarge => {
                return send(
                    &mut c,
                    &response(431, &[], "text/plain", b"the request head is too large\n"),
                )
            }
            ReadHead::Closed => return,
        };
        let head = match parse_request(&raw) {
            Ok(h) => h,
            Err(e) => {
                return send(
                    &mut c,
                    &response(400, &[], "text/plain", format!("{}\n", e).as_bytes()),
                )
            }
        };
        let host = head.get("host").unwrap_or("");
        let Some(slot) = slot_of(host, &self.cfg.host_suffix, &self.cfg.slots) else {
            return send(&mut c, &self.ended_page());
        };
        let token = self.table.lock().unwrap().token_of(slot).map(String::from);
        let Some(token) = token else {
            return send(&mut c, &self.ended_page());
        };
        let path = path_of(&head.target);
        let given = query_param(&head.target, "t").unwrap_or("");
        let right = is_token(given) && ct_eq(given.as_bytes(), token.as_bytes());
        match path {
            "/__play/enter" => {
                if !right {
                    return send(&mut c, &self.forbidden_page());
                }
                // the last session's service workers, storage and cache on this host go
                // ("cookies" would clear all of quillolang.org's, so it is not asked for)
                return send(
                    &mut c,
                    &response(
                        302,
                        &[
                            ("Location", format!("/__play/enter2?t={}", token)),
                            ("Clear-Site-Data", "\"cache\", \"storage\"".into()),
                            ("Cache-Control", "no-store".into()),
                            ("Referrer-Policy", "no-referrer".into()),
                        ],
                        "",
                        b"",
                    ),
                );
            }
            "/__play/enter2" => {
                if !right {
                    return send(&mut c, &self.forbidden_page());
                }
                self.table.lock().unwrap().touch(slot, Instant::now());
                let secure = if self.cfg.cookie_secure {
                    "; Secure"
                } else {
                    ""
                };
                return send(
                    &mut c,
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
            p if p == "/__play" || p.starts_with("/__play/") => {
                return send(
                    &mut c,
                    &response(
                        404,
                        &[("Cache-Control", "no-store".into())],
                        "text/plain",
                        b"not found\n",
                    ),
                );
            }
            _ => {}
        }
        let ok = cookie_values(&head, &self.cfg.cookie)
            .iter()
            .any(|v| ct_eq(v.as_bytes(), token.as_bytes()));
        if !ok {
            return send(&mut c, &self.forbidden_page());
        }
        self.table.lock().unwrap().touch(slot, Instant::now());
        let upgrade = is_websocket_upgrade(&head);
        let xff = if self.cfg.xff_from_peer {
            peer.map(|p| p.ip().to_string())
        } else {
            None
        };
        let fwd = forward_head(&head, &self.cfg.cookie, upgrade, xff.as_deref());
        // A request with no body may be sent again when the program closed without a
        // byte of answer (quillo does so now and then under load); one with a body may not.
        let bodyless = matches!(head.method.as_str(), "GET" | "HEAD")
            && head.get("content-length").is_none_or(|v| v == "0")
            && head.get("transfer-encoding").is_none()
            && rest.is_empty();
        let mut tries = if bodyless { 2 } else { 1 };
        loop {
            tries -= 1;
            let mut up = match self.backend.connect(&self.cfg.slots[slot]) {
                Ok(u) => u,
                Err(e) => {
                    eprintln!(
                        "quillo-play: {}: cannot reach the program: {}",
                        self.cfg.slots[slot], e
                    );
                    return send(&mut c, &self.not_answering_page());
                }
            };
            if let Err(e) = up.write_all(&fwd).and_then(|_| up.write_all(&rest)) {
                eprintln!(
                    "quillo-play: {}: cannot write to the program: {}",
                    self.cfg.slots[slot], e
                );
                return send(&mut c, &self.not_answering_page());
            }
            let mut first = vec![0u8; 16384];
            let mut got = 0;
            if bodyless {
                // the client has nothing more to send before the answer: wait for its first bytes
                let _ = up.set_read_timeout(Some(Duration::from_secs(120)));
                got = up.read(&mut first).unwrap_or(0);
                let _ = up.set_read_timeout(None);
                if got == 0 {
                    if tries > 0 {
                        eprintln!("quillo-play: {}: the program closed without an answer; sending the request again", self.cfg.slots[slot]);
                        continue;
                    }
                    eprintln!(
                        "quillo-play: {}: no answer from the program",
                        self.cfg.slots[slot]
                    );
                    return send(&mut c, &self.not_answering_page());
                }
            }
            first.truncate(got);
            let _ = c.set_read_timeout(None);
            let (Ok(mut c2), Ok(mut up2)) = (c.try_clone(), up.try_clone()) else {
                return;
            };
            let pump = std::thread::spawn(move || {
                let _ = io::copy(&mut c2, &mut up2);
                let _ = up2.shutdown(Shutdown::Write);
            });
            let mut sent = false;
            let r = {
                let mut from = (&first[..]).chain(&mut up);
                relay_response(
                    &mut from,
                    &mut CountingWriter {
                        inner: &mut c,
                        sent: &mut sent,
                    },
                    &self.cfg.cookie,
                    &self.cfg.frame_ancestors,
                )
            };
            if !sent && !matches!(r, Ok(true)) {
                eprintln!(
                    "quillo-play: {}: no answer from the program: {:?}",
                    self.cfg.slots[slot], r
                );
                send(&mut c, &self.not_answering_page());
            }
            let _ = c.shutdown(Shutdown::Both);
            let _ = up.shutdown(Shutdown::Both);
            let _ = pump.join();
            return;
        }
    }

    // ---- the website's API ----------------------------------------------------------

    fn api_conn(&self, mut s: TcpStream) {
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

    /// Reads what the slot's program printed since the last time, under the table's lock.
    fn pull(&self, t: &mut Table, slot: usize) {
        let name = &self.cfg.slots[slot];
        let keep = self.cfg.log_keep as u64;
        let Some(s) = t.slots[slot].as_mut() else {
            return;
        };
        if s.starting {
            return;
        }
        for _ in 0..8 {
            let off = s.log.offset;
            let Ok(c) = self.backend.log(name, off, LOG_CHUNK) else {
                break;
            };
            if c.size > off && c.size - off > keep {
                let to = c.size - keep;
                s.log.skipped(to - off);
                s.log.offset = to;
                continue;
            }
            if c.data.is_empty() {
                break;
            }
            s.log.push(&c.data);
            s.log.offset = c.next;
            if c.next >= c.size {
                break;
            }
        }
    }

    /// Whether quillo --watch has said it is watching with no socket made: the program
    /// did not start (an error, printed above), and waits for its files to change.
    fn waits_for_a_fix(&self, name: &str) -> bool {
        self.backend.log(name, 0, LOG_CHUNK).is_ok_and(|c| {
            String::from_utf8_lossy(&c.data)
                .lines()
                .any(|l| l.trim_end().ends_with("watching for changes"))
        })
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
            let mut t = self.table.lock().unwrap();
            if !t.holds(slot, token) {
                return;
            }
            if only_if_ended && t.slots[slot].as_ref().is_none_or(|s| s.starting) {
                return;
            }
            self.pull(&mut t, slot);
        }
        let name = self.cfg.slots[slot].clone();
        let st = self.status_of(&name);
        if only_if_ended && st.running {
            return;
        }
        {
            let mut t = self.table.lock().unwrap();
            if !t.holds(slot, token) {
                return;
            }
            self.pull(&mut t, slot);
        }
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
        let (expired, running): (Vec<(usize, String, Why)>, Running) = {
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
            (t.expired(now, self.cfg.max_runtime, self.cfg.idle), running)
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
            .map(|(i, _)| self.cfg.slots[*i].clone())
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
        let token = match new_token() {
            Ok(t) => t,
            Err(e) => return (500, json!({"error": format!("no token: {}", e)})),
        };
        let now = Instant::now();
        let slot = {
            let mut t = self.table.lock().unwrap();
            match t.begin(client, token.clone(), now) {
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
        if let Err(e) = self.backend.start(&name, &files) {
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
            self.pull(&mut t, slot);
        }
        drop(op);
        if !st.running {
            self.finish(slot, &token, None, true);
        }
        let t = self.table.lock().unwrap();
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
                "enter": format!("{}/__play/enter?t={}", self.cfg.origin(&name), token),
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
        let mut t = self.table.lock().unwrap();
        if let Some(slot) = t.by_token(session) {
            t.touch(slot, Instant::now());
            self.pull(&mut t, slot);
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

    /// Stops every slot (at start: whatever an earlier proxy left running).
    pub fn stop_every_slot(&self) {
        for s in &self.cfg.slots {
            self.backend.stop(s);
        }
    }
}

/// A writer that notes whether anything was written.
struct CountingWriter<'a, W: Write> {
    inner: &'a mut W,
    sent: &'a mut bool,
}

impl<W: Write> Write for CountingWriter<'_, W> {
    fn write(&mut self, b: &[u8]) -> io::Result<usize> {
        let n = self.inner.write(b)?;
        if n > 0 {
            *self.sent = true;
        }
        Ok(n)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}
