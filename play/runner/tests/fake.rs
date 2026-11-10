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
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

/// Each connection: the first `drop_first` are closed unanswered, the rest answered
/// with what they asked for.
struct Fake {
    drop_first: AtomicUsize,
    seen: Arc<Mutex<Vec<String>>>,
    running: Mutex<HashMap<String, bool>>,
}

impl Backend for Fake {
    fn start(&self, slot: &str, _files: &Files) -> Result<(), String> {
        self.running.lock().unwrap().insert(slot.into(), true);
        Ok(())
    }
    fn connect(&self, _slot: &str) -> Result<UnixStream, String> {
        let (a, mut b) = UnixStream::pair().map_err(|e| e.to_string())?;
        let drop_it = self
            .drop_first
            .try_update(Ordering::SeqCst, Ordering::SeqCst, |n| n.checked_sub(1))
            .is_ok();
        let seen = self.seen.clone();
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
            let _ = b.write_all(b"HTTP/1.1 200 OK\r\nX-Frame-Options: SAMEORIGIN\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok");
        });
        Ok(a)
    }
    fn status(&self, slots: &[String]) -> HashMap<String, Status> {
        let r = self.running.lock().unwrap();
        slots
            .iter()
            .map(|s| {
                (
                    s.clone(),
                    Status {
                        running: *r.get(s).unwrap_or(&false),
                        exit: None,
                        result: None,
                    },
                )
            })
            .collect()
    }
    fn log(&self, _slot: &str, offset: u64, _max: usize) -> Result<Chunk, String> {
        Ok(Chunk {
            data: Vec::new(),
            next: offset,
            size: offset,
        })
    }
    fn stop(&self, slot: &str) {
        self.running.lock().unwrap().insert(slot.into(), false);
    }
    fn stop_all(&self) {}
}

fn up(slots: usize, runs_per_hour: usize) -> (SocketAddr, SocketAddr, u16, Arc<Fake>) {
    let mut c = Config::defaults(Role::Dev);
    c.secret = SECRET.into();
    c.slots = quillo_play::config::slot_names(slots);
    c.runs_per_hour = runs_per_hour;
    let api_l = TcpListener::bind("127.0.0.1:0").unwrap();
    let pre_l = TcpListener::bind("127.0.0.1:0").unwrap();
    c.public_port = Some(pre_l.local_addr().unwrap().port());
    c.finish().unwrap();
    let f = Arc::new(Fake {
        drop_first: AtomicUsize::new(0),
        seen: Arc::new(Mutex::new(Vec::new())),
        running: Mutex::new(HashMap::new()),
    });
    let (a, p, port) = (
        api_l.local_addr().unwrap(),
        pre_l.local_addr().unwrap(),
        c.public_port.unwrap(),
    );
    Proxy::new(c, f.clone()).start(api_l, pre_l);
    (a, p, port, f)
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
