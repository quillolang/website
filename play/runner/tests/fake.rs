//! The proxy against a fake program (no quillo needed): a request sent again after the
//! program closed without answering, but only one with no body; the API's limits.

mod common;
use common::*;
use quillo_play::backend::{Backend, Chunk, Status};
use quillo_play::config::{Config, Role};
use quillo_play::files::Files;
use quillo_play::proxy::Proxy;
use serde_json::json;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener};
use std::os::unix::net::UnixStream;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::{Duration, Instant};
use std::sync::{Arc, Mutex};

/// Each connection: the first `drop_first` are closed unanswered, the rest answered
/// with what they asked for (or `answer`, when set); with `hold`, read and never answered.
/// What came after each head (within 300 ms) is kept in `bodies`.
#[derive(Default)]
struct Fake {
    drop_first: AtomicUsize,
    seen: Arc<Mutex<Vec<String>>>,
    bodies: Arc<Mutex<Vec<Vec<u8>>>>,
    running: Mutex<HashMap<String, bool>>,
    hold: Arc<AtomicBool>,
    held: Arc<Mutex<Vec<UnixStream>>>,
    answer: Arc<Mutex<Option<Vec<u8>>>>,
    slow_log: AtomicBool,
    fail_start: AtomicBool,
    stops: Mutex<Vec<String>>,
    /// Slots whose program runs though nothing started it here.
    ghosts: Mutex<Vec<String>>,
}

impl Backend for Fake {
    fn start(&self, slot: &str, _files: &Files) -> Result<(), String> {
        if self.fail_start.load(Ordering::SeqCst) {
            // as a start the spawner went on with after the proxy stopped waiting
            self.running.lock().unwrap().insert(slot.into(), true);
            return Err("the spawner: Resource temporarily unavailable".into());
        }
        self.running.lock().unwrap().insert(slot.into(), true);
        Ok(())
    }
    fn connect(&self, _slot: &str) -> Result<UnixStream, String> {
        let (a, mut b) = UnixStream::pair().map_err(|e| e.to_string())?;
        let drop_it = self
            .drop_first
            .try_update(Ordering::SeqCst, Ordering::SeqCst, |n| n.checked_sub(1))
            .is_ok();
        let (seen, bodies, hold, held, answer) = (
            self.seen.clone(),
            self.bodies.clone(),
            self.hold.clone(),
            self.held.clone(),
            self.answer.clone(),
        );
        std::thread::spawn(move || {
            let mut buf = Vec::new();
            let mut chunk = [0u8; 4096];
            while !buf.windows(4).any(|w| w == b"\r\n\r\n") {
                match b.read(&mut chunk) {
                    Ok(0) | Err(_) => return,
                    Ok(n) => buf.extend_from_slice(&chunk[..n]),
                }
            }
            let text = String::from_utf8_lossy(&buf).to_string();
            if text.starts_with("GET /__probe") || text.is_empty() {
                return;
            }
            seen.lock()
                .unwrap()
                .push(text.lines().next().unwrap_or("").to_string());
            if drop_it {
                return; // closed, nothing said
            }
            if hold.load(Ordering::SeqCst) {
                held.lock().unwrap().push(b);
                return;
            }
            let end = buf.windows(4).position(|w| w == b"\r\n\r\n").unwrap() + 4;
            let mut extra = buf[end..].to_vec();
            b.set_read_timeout(Some(Duration::from_millis(300))).unwrap();
            while let Ok(n) = b.read(&mut chunk) {
                if n == 0 {
                    break;
                }
                extra.extend_from_slice(&chunk[..n]);
            }
            bodies.lock().unwrap().push(extra);
            let a = answer.lock().unwrap().clone();
            let _ = b.write_all(&a.unwrap_or_else(|| b"HTTP/1.1 200 OK\r\nX-Frame-Options: SAMEORIGIN\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok".to_vec()));
        });
        Ok(a)
    }
    fn status(&self, slots: &[String]) -> HashMap<String, Status> {
        let r = self.running.lock().unwrap();
        let g = self.ghosts.lock().unwrap();
        slots
            .iter()
            .map(|s| {
                (
                    s.clone(),
                    Status {
                        running: *r.get(s).unwrap_or(&false) || g.contains(s),
                        exit: None,
                        result: None,
                    },
                )
            })
            .collect()
    }
    fn log(&self, _slot: &str, offset: u64, _max: usize) -> Result<Chunk, String> {
        if self.slow_log.load(Ordering::SeqCst) {
            std::thread::sleep(Duration::from_secs(3));
        }
        Ok(Chunk {
            data: Vec::new(),
            next: offset,
            size: offset,
        })
    }
    fn stop(&self, slot: &str) {
        self.running.lock().unwrap().insert(slot.into(), false);
        self.ghosts.lock().unwrap().retain(|g| g != slot);
        self.stops.lock().unwrap().push(slot.into());
    }
    fn stop_all(&self) {}
}

fn up(slots: usize, runs_per_hour: usize) -> (SocketAddr, SocketAddr, u16, Arc<Fake>) {
    up_with(slots, runs_per_hour, |_| {})
}

fn up_with(
    slots: usize,
    runs_per_hour: usize,
    tweak: impl FnOnce(&mut Config),
) -> (SocketAddr, SocketAddr, u16, Arc<Fake>) {
    let mut c = Config::defaults(Role::Dev);
    c.secret = SECRET.into();
    c.slots = quillo_play::config::slot_names(slots);
    c.runs_per_hour = runs_per_hour;
    tweak(&mut c);
    let api_l = TcpListener::bind("127.0.0.1:0").unwrap();
    let pre_l = TcpListener::bind("127.0.0.1:0").unwrap();
    c.public_port = Some(pre_l.local_addr().unwrap().port());
    c.finish().unwrap();
    let f = Arc::new(Fake::default());
    let (a, p, port) = (
        api_l.local_addr().unwrap(),
        pre_l.local_addr().unwrap(),
        c.public_port.unwrap(),
    );
    Proxy::new(c, f.clone()).start(api_l, pre_l);
    (a, p, port, f)
}

/// Runs a program for `client` and goes in as its frame would: the host and the cookie.
fn run_and_enter(a: SocketAddr, p: SocketAddr, port: u16, client: &str) -> (String, String) {
    let r = run(a, client).json();
    let enter = r["enter"].as_str().unwrap().to_string();
    let host = format!("{}:{}", r["host"].as_str().unwrap(), port);
    let path = enter.split_once(&host).unwrap().1.replace("/__play/enter?", "/__play/enter2?");
    let b = get(p, &host, &path, &[("Sec-Fetch-Dest", "iframe")]);
    assert_eq!(b.status, 302, "{}", b.head);
    let cookie = b.header("set-cookie").unwrap().split(';').next().unwrap().to_string();
    (host, cookie)
}

fn run(a: SocketAddr, client: &str) -> Reply {
    api(
        a,
        "POST",
        "/run",
        Some(&json!({"files": {"main.qwe": "x"}, "client": client})),
        Some(SECRET),
    )
}

#[test]
fn a_request_without_a_body_is_sent_again_once() {
    let _d = Deadline::new(30, "retry", || {});
    let (a, p, port, f) = up(2, 30);
    let r = run(a, "ip:1").json();
    let token = r["session"].as_str().unwrap();
    let host = format!("s01.play.localhost:{}", port);
    let cookie = format!("play={}", token);
    f.seen.lock().unwrap().clear();

    f.drop_first.store(1, Ordering::SeqCst);
    let g = get(p, &host, "/page", &[("Cookie", &cookie)]);
    assert_eq!(g.status, 200, "{}", g.head);
    assert_eq!(g.body, "ok");
    assert!(g.header("x-frame-options").is_none());
    assert_eq!(
        f.seen
            .lock()
            .unwrap()
            .iter()
            .filter(|l| l.starts_with("GET /page"))
            .count(),
        2,
        "sent twice"
    );

    // twice in a row: once again only, then the page that says so
    f.drop_first.store(2, Ordering::SeqCst);
    let g = get(p, &host, "/twice", &[("Cookie", &cookie)]);
    assert_eq!(g.status, 502);
    assert!(g.body.contains("not answering"));

    // a POST with a body is never sent twice
    f.seen.lock().unwrap().clear();
    f.drop_first.store(1, Ordering::SeqCst);
    let post = format!(
        "POST /form HTTP/1.1\r\nHost: {}\r\nCookie: {}\r\nContent-Length: 3\r\n\r\na=1",
        host, cookie
    );
    let r = parse(&raw(p, post.as_bytes()));
    assert_eq!(r.status, 502);
    assert_eq!(
        f.seen
            .lock()
            .unwrap()
            .iter()
            .filter(|l| l.starts_with("POST /form"))
            .count(),
        1,
        "a POST was sent again"
    );
}

#[test]
fn the_apis_limits() {
    let _d = Deadline::new(30, "limits", || {});
    let (a, _p, _port, _f) = up(2, 3);
    assert_eq!(run(a, "ip:1").status, 200);
    assert_eq!(run(a, "ip:2").status, 200);
    let busy = run(a, "ip:3");
    assert_eq!(busy.status, 503);
    // a client already in replaces its own run, up to 3 an hour
    assert_eq!(run(a, "ip:1").status, 200);
    assert_eq!(run(a, "ip:1").status, 200);
    let many = run(a, "ip:1");
    assert_eq!(many.status, 429, "{}", many.body);
    assert!(many.json()["error"]
        .as_str()
        .unwrap()
        .contains("at most 3 an hour"));
    // bodies the API refuses
    let r = parse(&raw(a, format!("POST /run HTTP/1.1\r\nHost: x\r\nAuthorization: Bearer {}\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n", SECRET).as_bytes()));
    assert_eq!(r.status, 411);
    let r = parse(&raw(a, format!("POST /run HTTP/1.1\r\nHost: x\r\nAuthorization: Bearer {}\r\nContent-Length: 99999999\r\n\r\n", SECRET).as_bytes()));
    assert_eq!(r.status, 413);
    let r = parse(&raw(a, format!("POST /run HTTP/1.1\r\nHost: x\r\nAuthorization: Bearer {}\r\nContent-Length: 3\r\n\r\n{{{{{{", SECRET).as_bytes()));
    assert_eq!(r.status, 400);
    assert_eq!(
        api(
            a,
            "POST",
            "/stop",
            Some(&json!({"session": 5})),
            Some(SECRET)
        )
        .json(),
        json!({})
    );
    let r = parse(&raw(
        a,
        b"GET /health HTTP/1.1\r\nHost: x\r\nAuthorization: bearer test-secret-0123456789\r\n\r\n",
    ));
    assert_eq!(r.status, 401, "the scheme is Bearer, as written");
}

#[test]
fn the_enter_link_works_once_in_a_frame_and_not_for_long() {
    // review L4, and the main session's Sec-Fetch-Dest addition
    let _d = Deadline::new(30, "enter", || {});
    let (a, p, port, _f) = up_with(2, 30, |c| c.enter_ttl = Duration::from_secs(1));
    let r = run(a, "ip:1").json();
    let session = r["session"].as_str().unwrap().to_string();
    let host = format!("s01.play.localhost:{}", port);
    let e = r["enter"].as_str().unwrap().rsplit_once("t=").unwrap().1.to_string();
    assert_ne!(e, session);
    let at = |path: &str, dest: Option<&str>| {
        let h: Vec<(&str, &str)> = dest.map(|d| vec![("Sec-Fetch-Dest", d)]).unwrap_or_default();
        get(p, &host, &format!("{}?t={}", path, e), &h).status
    };
    for dest in ["document", "empty", "script", "image", "frame", ""] {
        assert_eq!(at("/__play/enter", Some(dest)), 403, "Sec-Fetch-Dest: {:?}", dest);
        assert_eq!(at("/__play/enter2", Some(dest)), 403, "Sec-Fetch-Dest: {:?}", dest);
    }
    assert_eq!(at("/__play/enter", Some("IFRAME")), 302, "any case");
    assert_eq!(at("/__play/enter", None), 302, "a browser that says nothing");
    assert_eq!(at("/__play/enter", None), 302, "the first step, again");
    assert_eq!(at("/__play/enter2", Some("iframe")), 302);
    assert_eq!(at("/__play/enter2", Some("iframe")), 403, "used up");
    assert_eq!(at("/__play/enter", Some("iframe")), 403, "used up for the first step too");
    // a new run: a new link, which is too old after enter-ttl
    let r = run(a, "ip:1").json();
    let e2 = r["enter"].as_str().unwrap().rsplit_once("t=").unwrap().1.to_string();
    std::thread::sleep(Duration::from_millis(1200));
    assert_eq!(get(p, &host, &format!("/__play/enter2?t={}", e2), &[]).status, 403);
    // the session's own token was never a way in
    assert_eq!(get(p, &host, &format!("/__play/enter2?t={}", session), &[]).status, 403);
}

#[test]
fn the_enter_token_is_only_in_the_run_answer() {
    // the main session's addition: never in /log or /stop answers
    let _d = Deadline::new(30, "enter-only", || {});
    let (a, _p, _port, _f) = up(2, 30);
    let r = run(a, "ip:1");
    let v = r.json();
    let e = v["enter"].as_str().unwrap().rsplit_once("t=").unwrap().1.to_string();
    let session = v["session"].as_str().unwrap();
    let log = api(a, "GET", &format!("/log?session={}&after=0", session), None, Some(SECRET));
    assert_eq!(log.status, 200);
    assert!(!log.body.contains(&e) && !log.head.contains(&e));
    let stop = api(a, "POST", "/stop", Some(&json!({"session": session})), Some(SECRET));
    assert!(!stop.body.contains(&e) && !stop.head.contains(&e));
    let ended = api(a, "GET", &format!("/log?session={}&after=0", session), None, Some(SECRET));
    assert!(!ended.body.contains(&e));
    let h = api(a, "GET", "/health", None, Some(SECRET));
    assert!(!h.body.contains(&e));
}

#[test]
fn service_workers_are_refused_on_previews() {
    // review M2
    let _d = Deadline::new(30, "sw", || {});
    let (a, p, port, _f) = up(2, 30);
    let (host, cookie) = run_and_enter(a, p, port, "ip:1");
    let sw = get(p, &host, "/sw.js", &[("Cookie", &cookie), ("Service-Worker", "script")]);
    assert_eq!(sw.status, 403);
    let ok = get(p, &host, "/sw.js", &[("Cookie", &cookie)]);
    assert_eq!(ok.status, 200);
    // and what is served is kept by no browser
    assert_eq!(ok.header("cache-control").unwrap(), "no-store");
}

#[test]
fn bodies_are_as_long_as_they_say() {
    // review L2: what comes after the body (a second request) is not sent on; no chunked
    let _d = Deadline::new(30, "bodies", || {});
    let (a, p, port, f) = up(2, 30);
    let (host, cookie) = run_and_enter(a, p, port, "ip:1");
    f.bodies.lock().unwrap().clear();
    let req = format!("POST /form HTTP/1.1\r\nHost: {h}\r\nCookie: {c}\r\nContent-Length: 3\r\n\r\na=1GET /second HTTP/1.1\r\nHost: {h}\r\nCookie: {c}\r\n\r\n", h = host, c = cookie);
    let r = parse(&raw(p, req.as_bytes()));
    assert_eq!(r.status, 200);
    assert_eq!(f.bodies.lock().unwrap().last().unwrap(), b"a=1");
    assert!(!f.seen.lock().unwrap().iter().any(|l| l.starts_with("GET /second")));
    // a body that comes later, in two parts, and then more
    let mut s = std::net::TcpStream::connect(p).unwrap();
    s.set_read_timeout(Some(Duration::from_secs(10))).unwrap();
    s.write_all(format!("POST /late HTTP/1.1\r\nHost: {}\r\nCookie: {}\r\nContent-Length: 5\r\n\r\nab", host, cookie).as_bytes()).unwrap();
    std::thread::sleep(Duration::from_millis(100));
    s.write_all(b"cdeXYZ").unwrap();
    let mut out = String::new();
    let _ = s.read_to_string(&mut out);
    assert!(out.starts_with("HTTP/1.1 200"), "{}", out);
    assert_eq!(f.bodies.lock().unwrap().last().unwrap(), b"abcde");
    // chunked: refused, as the API does
    let req = format!("POST /c HTTP/1.1\r\nHost: {}\r\nCookie: {}\r\nTransfer-Encoding: chunked\r\n\r\n1\r\na\r\n0\r\n\r\n", host, cookie);
    assert_eq!(parse(&raw(p, req.as_bytes())).status, 411);
    // a WebSocket request with a body: refused
    let req = format!("GET /ws HTTP/1.1\r\nHost: {}\r\nCookie: {}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nContent-Length: 1\r\n\r\nx", host, cookie);
    assert_eq!(parse(&raw(p, req.as_bytes())).status, 400);
}

#[test]
fn a_second_answer_and_an_unasked_101_never_reach_the_client() {
    // reviews L2 and L3
    let _d = Deadline::new(30, "answers", || {});
    let (a, p, port, f) = up(2, 30);
    let (host, cookie) = run_and_enter(a, p, port, "ip:1");
    *f.answer.lock().unwrap() = Some(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: keep-alive\r\n\r\nokHTTP/1.1 200 OK\r\nSet-Cookie: x=1; Domain=quillolang.org\r\n\r\nsmuggled".to_vec());
    let r = get(p, &host, "/", &[("Cookie", &cookie)]);
    assert_eq!(r.status, 200);
    assert_eq!(r.body, "ok");
    assert_eq!(r.header("connection").unwrap(), "close");
    *f.answer.lock().unwrap() = Some(b"HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n\x81\x02hi".to_vec());
    let r = get(p, &host, "/", &[("Cookie", &cookie)]);
    assert_eq!(r.status, 502, "{}", r.head);
    assert!(r.body.contains("not answering"));
    // a head the strict parser refuses: 502 too (review L1)
    *f.answer.lock().unwrap() = Some(b"HTTP/1.1 200 OK\r\nX: a\r\n folded\r\nContent-Length: 0\r\n\r\n".to_vec());
    assert_eq!(get(p, &host, "/", &[("Cookie", &cookie)]).status, 502);
}

#[test]
fn a_program_that_says_nothing_is_let_go() {
    // review H2: the program side's idle limit
    let _d = Deadline::new(30, "idle-up", || {});
    let (a, p, port, f) = up_with(2, 30, |c| c.upstream_idle = Duration::from_secs(1));
    let (host, cookie) = run_and_enter(a, p, port, "ip:1");
    f.hold.store(true, Ordering::SeqCst);
    let t = Instant::now();
    let r = get(p, &host, "/", &[("Cookie", &cookie)]);
    let took = t.elapsed();
    assert_eq!(r.status, 502);
    // a GET with no body is tried twice: about 2 s, well under the 15 s the client waits
    assert!(took >= Duration::from_millis(900) && took < Duration::from_secs(6), "{:?}", took);
    // a POST with a body is tried once
    let t = Instant::now();
    let req = format!("POST /f HTTP/1.1\r\nHost: {}\r\nCookie: {}\r\nContent-Length: 1\r\n\r\nx", host, cookie);
    assert_eq!(parse(&raw(p, req.as_bytes())).status, 502);
    assert!(t.elapsed() < Duration::from_secs(4), "{:?}", t.elapsed());
}

#[test]
fn connections_are_capped_by_preview_and_in_all() {
    // review H2
    let _d = Deadline::new(30, "caps", || {});
    let (a, p, port, f) = up_with(3, 30, |c| {
        c.max_slot_conns = 2;
        c.max_preview_conns = 3;
        c.upstream_idle = Duration::from_secs(2);
    });
    let (h1, c1) = run_and_enter(a, p, port, "ip:1");
    let (h2, c2) = run_and_enter(a, p, port, "ip:2");
    f.hold.store(true, Ordering::SeqCst);
    let open = |host: &str, cookie: &str| {
        let mut s = std::net::TcpStream::connect(p).unwrap();
        s.set_read_timeout(Some(Duration::from_secs(10))).unwrap();
        s.write_all(format!("POST /hold HTTP/1.1\r\nHost: {}\r\nCookie: {}\r\nContent-Length: 0\r\n\r\n", host, cookie).as_bytes()).unwrap();
        std::thread::sleep(Duration::from_millis(200));
        s
    };
    let _x1 = open(&h1, &c1);
    let _x2 = open(&h1, &c1);
    let third = get(p, &h1, "/", &[("Cookie", &c1)]);
    assert_eq!(third.status, 503, "{}", third.head);
    assert!(third.body.contains("this preview"));
    // another preview still has room, up to three in all
    let _x3 = open(&h2, &c2);
    let fourth = get(p, &h2, "/", &[("Cookie", &c2)]);
    assert_eq!(fourth.status, 503);
    assert!(fourth.body.contains("too many connections"));
    // the held ones are let go after upstream-idle; then there is room again
    f.hold.store(false, Ordering::SeqCst);
    let ok = quillo_play::dev::wait_until(Duration::from_secs(8), || {
        get(p, &h1, "/", &[("Cookie", &c1)]).status == 200
    });
    assert!(ok, "no room came back");
}

#[test]
fn a_slow_spawner_holds_up_no_preview() {
    // review M6: no spawner call under the table's lock
    let _d = Deadline::new(30, "slow", || {});
    let (a, p, port, f) = up(2, 30);
    let (host, cookie) = run_and_enter(a, p, port, "ip:1");
    let session = {
        let r = run(a, "ip:2").json();
        r["session"].as_str().unwrap().to_string()
    };
    f.slow_log.store(true, Ordering::SeqCst);
    let poll = std::thread::spawn(move || {
        api(a, "GET", &format!("/log?session={}&after=0", session), None, Some(SECRET)).status
    });
    std::thread::sleep(Duration::from_millis(300));
    let t = Instant::now();
    let g = get(p, &host, "/", &[("Cookie", &cookie)]);
    assert_eq!(g.status, 200);
    assert!(t.elapsed() < Duration::from_secs(1), "the preview waited {:?}", t.elapsed());
    assert_eq!(poll.join().unwrap(), 200);
    f.slow_log.store(false, Ordering::SeqCst);
}

#[test]
fn programs_no_session_holds_are_stopped() {
    // review L5
    let _d = Deadline::new(30, "orphans", || {});
    let (a, _p, _port, f) = up(3, 30);
    f.fail_start.store(true, Ordering::SeqCst);
    let r = run(a, "ip:1");
    assert_eq!(r.status, 500);
    assert_eq!(f.stops.lock().unwrap().as_slice(), ["s01"], "a start that failed is stopped");
    assert_eq!(api(a, "GET", "/health", None, Some(SECRET)).json()["busy"], json!(0));
    f.fail_start.store(false, Ordering::SeqCst);
    // a program running where the table has none: the reaper (every 2 s) stops it
    f.stops.lock().unwrap().clear();
    f.ghosts.lock().unwrap().push("s03".into());
    let held = run(a, "ip:2").json();
    assert_eq!(held["host"], json!("s01.play.localhost"));
    let ok = quillo_play::dev::wait_until(Duration::from_secs(6), || {
        f.stops.lock().unwrap().iter().any(|s| s == "s03")
    });
    assert!(ok, "the ghost was not stopped: {:?}", f.stops.lock().unwrap());
    assert!(!f.stops.lock().unwrap().iter().any(|s| s == "s01"), "a held slot is left alone");
}

#[test]
fn one_ipv6_64_is_one_client() {
    // review M3
    let _d = Deadline::new(30, "v6", || {});
    let (a, _p, _port, _f) = up(3, 30);
    let one = run(a, "ip:2001:db8:1:2::1").json();
    assert_eq!(one["host"], json!("s01.play.localhost"));
    let same = run(a, "ip:2001:db8:1:2:ffff:ffff:ffff:ffff").json();
    assert_eq!(same["host"], json!("s01.play.localhost"), "the same /64: its run takes the first's place");
    assert_eq!(api(a, "GET", "/health", None, Some(SECRET)).json()["busy"], json!(1));
    let other = run(a, "ip:2001:db8:1:3::1").json();
    assert_eq!(other["host"], json!("s02.play.localhost"));
    let mapped = run(a, "ip:::ffff:10.0.0.1").json();
    let v4 = run(a, "ip:10.0.0.1").json();
    assert_eq!(mapped["host"], v4["host"], "an IPv4-mapped address is that IPv4 address");
}
