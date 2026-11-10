#![allow(dead_code)]
//! Helpers for the tests that run real programs with the quillo on this machine.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::time::Duration;

pub const SECRET: &str = "test-secret-0123456789";

/// The quillo to run programs with: QUILLO_BIN, else ~/.cargo/bin/quillo, else none (the
/// test says so and passes without running).
pub fn quillo() -> Option<PathBuf> {
    if let Ok(q) = std::env::var("QUILLO_BIN") {
        return Some(q.into());
    }
    let p = PathBuf::from(std::env::var("HOME").ok()?).join(".cargo/bin/quillo");
    p.exists().then_some(p)
}

pub const PROGRAM: &str = r#"print("hello from the program")
route GET / = <html><body><h1>Counter page</h1></body></html>
route GET /cookies = request.headers.cookie ?? "none"
route GET /setcookie {
    set_cookie("pref", "1", { domain: "play.localhost" })
    "set"
}
route GET /clear = respond(200, "cleared", { "clear-site-data": "\"cookies\"" })
route GET /ip = request.ip
"#;

pub struct Reply {
    pub status: u16,
    pub head: String,
    pub body: String,
}

impl Reply {
    pub fn header(&self, name: &str) -> Option<String> {
        self.head.lines().skip(1).find_map(|l| {
            let (n, v) = l.split_once(':')?;
            n.trim()
                .eq_ignore_ascii_case(name)
                .then(|| v.trim().to_string())
        })
    }
    pub fn json(&self) -> serde_json::Value {
        serde_json::from_str(&self.body)
            .unwrap_or_else(|e| panic!("not JSON ({}): {}", e, self.body))
    }
}

/// Sends raw bytes and reads until the server closes (every answer here closes).
pub fn raw(addr: SocketAddr, req: &[u8]) -> String {
    let mut s = TcpStream::connect(addr).unwrap();
    s.set_read_timeout(Some(Duration::from_secs(15))).unwrap();
    s.write_all(req).unwrap();
    let mut out = Vec::new();
    let _ = s.read_to_end(&mut out);
    String::from_utf8_lossy(&out).into_owned()
}

pub fn parse(text: &str) -> Reply {
    let (head, body) = text.split_once("\r\n\r\n").unwrap_or((text, ""));
    let status = head
        .split(' ')
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    Reply {
        status,
        head: head.to_string(),
        body: body.to_string(),
    }
}

pub fn get(addr: SocketAddr, host: &str, path: &str, headers: &[(&str, &str)]) -> Reply {
    let mut r = format!("GET {} HTTP/1.1\r\nHost: {}\r\n", path, host);
    for (n, v) in headers {
        r.push_str(&format!("{}: {}\r\n", n, v));
    }
    r.push_str("\r\n");
    parse(&raw(addr, r.as_bytes()))
}

pub fn api(
    addr: SocketAddr,
    method: &str,
    path: &str,
    body: Option<&serde_json::Value>,
    secret: Option<&str>,
) -> Reply {
    let b = body.map(|v| v.to_string()).unwrap_or_default();
    let auth = secret
        .map(|s| format!("Authorization: Bearer {}\r\n", s))
        .unwrap_or_default();
    let r = format!("{} {} HTTP/1.1\r\nHost: 127.0.0.1\r\n{}Content-Type: application/json\r\nContent-Length: {}\r\n\r\n{}", method, path, auth, b.len(), b);
    parse(&raw(addr, r.as_bytes()))
}

/// Ends the test process after `secs` (running `cleanup` first) unless dropped: no test
/// here hangs.
pub struct Deadline(std::sync::Arc<std::sync::atomic::AtomicBool>);

impl Deadline {
    pub fn new(secs: u64, name: &'static str, cleanup: impl FnOnce() + Send + 'static) -> Deadline {
        let done = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let d = done.clone();
        std::thread::spawn(move || {
            let end = std::time::Instant::now() + Duration::from_secs(secs);
            while std::time::Instant::now() < end {
                if d.load(std::sync::atomic::Ordering::SeqCst) {
                    return;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            eprintln!("{}: over its {} s deadline, stopping", name, secs);
            cleanup();
            std::process::exit(101);
        });
        Deadline(done)
    }
}

impl Drop for Deadline {
    fn drop(&mut self) {
        self.0.store(true, std::sync::atomic::Ordering::SeqCst);
    }
}
