//! The spawner's socket: one JSON request per connection, one JSON answer (with a
//! connected socket for `connect`). It serves whatever Backend it is given: the
//! systemd one on the server; tests give it the dev one.
//!
//!   {"op":"start","slot":"s07","files":{...}}      → {"ok":true} | {"ok":false,"error":...}
//!   {"op":"connect","slot":"s07"}                  → {"ok":true} and the socket | {"ok":false,"error":...}
//!   {"op":"status","slots":["s01",...]}            → {"ok":true,"status":{"s01":{"running":..,"exit":..,"result":..}}}
//!   {"op":"status","slot":"s01"}                   → the same, for one
//!   {"op":"log","slot":"s07","offset":N,"max":M}   → {"ok":true,"data64":"<base64>","next":N2,"size":S}
//!   {"op":"stop","slot":"s07"}                     → {"ok":true}

use crate::backend::Backend;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::os::unix::io::AsRawFd;
use std::os::unix::net::{UnixListener, UnixStream};
use std::sync::Arc;
use std::time::Duration;

/// A request line is at most this long: 256 KB of files, escaped, with room to spare.
pub const MAX_LINE: usize = 4 * 1024 * 1024;
pub const LOG_MAX: usize = 64 * 1024;

pub fn serve(
    listener: UnixListener,
    backend: Arc<dyn Backend>,
    slots: Vec<String>,
    allowed_uids: Vec<u32>,
) {
    let mut said = false;
    for c in listener.incoming() {
        let c = match c {
            Ok(c) => c,
            Err(e) => {
                // out of file descriptors and the like: wait, rather than spin (review H2)
                if !said {
                    eprintln!("quillo-play spawner: accept: {} (said once)", e);
                    said = true;
                }
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }
        };
        let ok = crate::util::peer_uid(&c).is_ok_and(|u| allowed_uids.contains(&u));
        if !ok {
            continue; // dropped unanswered
        }
        let b = backend.clone();
        let slots = slots.clone();
        // a thread that cannot be made drops this request; the loop goes on (review H2)
        if let Err(e) = std::thread::Builder::new().spawn(move || handle(c, b.as_ref(), &slots)) {
            if !said {
                eprintln!("quillo-play spawner: no thread: {} (said once)", e);
                said = true;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    }
}

fn handle(c: UnixStream, b: &dyn Backend, slots: &[String]) {
    let _ = c.set_read_timeout(Some(Duration::from_secs(10)));
    let _ = c.set_write_timeout(Some(Duration::from_secs(10)));
    let mut line = Vec::new();
    {
        let mut r = BufReader::new(std::io::Read::take(&c, MAX_LINE as u64 + 1));
        if r.read_until(b'\n', &mut line).is_err() {
            return;
        }
    }
    if line.len() > MAX_LINE || !line.ends_with(b"\n") {
        let _ = answer(
            &c,
            json!({"ok": false, "error": "a request is one line of JSON"}),
            None,
        );
        return;
    }
    let (v, sock) = dispatch(&line, b, slots);
    let _ = answer(&c, v, sock.as_ref());
    if sock.is_some() {
        // Our copy of the socket is kept until the proxy has its own: it closes this
        // connection as soon as it has read the answer. A socket that is only in flight when
        // its last other copy closes can be swept by macOS's unix-socket garbage collector,
        // which shuts its receiving side: the protocol test saw an EOF there, about 1 run in
        // 12 under load, on the code before the review's fixes too.
        let mut one = [0u8; 1];
        let _ = std::io::Read::read(&mut &c, &mut one);
    }
}

fn answer(c: &UnixStream, v: Value, sock: Option<&UnixStream>) -> std::io::Result<()> {
    let mut s = v.to_string();
    s.push('\n');
    match sock {
        Some(sk) => crate::fdpass::send(c, s.as_bytes(), Some(sk.as_raw_fd())),
        None => {
            let mut w = c;
            w.write_all(s.as_bytes())
        }
    }
}

fn slot_arg<'a>(v: &'a Value, slots: &[String]) -> Result<&'a str, Value> {
    let s = v.get("slot").and_then(|s| s.as_str()).unwrap_or("");
    if slots.iter().any(|x| x == s) {
        Ok(s)
    } else {
        Err(json!({"ok": false, "error": format!("no slot {:?}", s)}))
    }
}

/// One request's answer, and the socket to send with it.
pub fn dispatch(line: &[u8], b: &dyn Backend, slots: &[String]) -> (Value, Option<UnixStream>) {
    let v: Value = match serde_json::from_slice(line) {
        Ok(v) => v,
        Err(e) => {
            return (
                json!({"ok": false, "error": format!("not JSON: {}", e)}),
                None,
            )
        }
    };
    let op = v.get("op").and_then(|o| o.as_str()).unwrap_or("");
    let fail = |e: String| (json!({"ok": false, "error": e}), None);
    match op {
        "start" => {
            let slot = match slot_arg(&v, slots) {
                Ok(s) => s,
                Err(e) => return (e, None),
            };
            // the spawner checks the files itself: it trusts the proxy no more than that
            let files = match crate::files::validate(v.get("files").unwrap_or(&Value::Null)) {
                Ok(f) => f,
                Err(e) => return fail(e),
            };
            match b.start(slot, &files) {
                Ok(()) => (json!({"ok": true}), None),
                Err(e) => fail(e),
            }
        }
        "connect" => {
            let slot = match slot_arg(&v, slots) {
                Ok(s) => s,
                Err(e) => return (e, None),
            };
            match b.connect(slot) {
                Ok(s) => (json!({"ok": true}), Some(s)),
                Err(e) => fail(e),
            }
        }
        "status" => {
            let want: Vec<String> = match (
                v.get("slots").and_then(|s| s.as_array()),
                v.get("slot").and_then(|s| s.as_str()),
            ) {
                (Some(a), _) => a
                    .iter()
                    .filter_map(|x| x.as_str())
                    .filter(|x| slots.iter().any(|s| s == x))
                    .map(String::from)
                    .collect(),
                (None, Some(s)) if slots.iter().any(|x| x == s) => vec![s.to_string()],
                _ => return fail("status takes slot or slots".into()),
            };
            let st = b.status(&want);
            let mut m = serde_json::Map::new();
            for (k, s) in st {
                m.insert(
                    k,
                    json!({"running": s.running, "exit": s.exit, "result": s.result}),
                );
            }
            (json!({"ok": true, "status": m}), None)
        }
        "log" => {
            let slot = match slot_arg(&v, slots) {
                Ok(s) => s,
                Err(e) => return (e, None),
            };
            let offset = v.get("offset").and_then(|o| o.as_u64()).unwrap_or(0);
            let max = v
                .get("max")
                .and_then(|o| o.as_u64())
                .map_or(LOG_MAX, |m| (m as usize).min(LOG_MAX));
            match b.log(slot, offset, max) {
                // base64: the bytes whole, a character cut at the chunk's edge included (review L7)
                Ok(c) => (
                    json!({"ok": true, "data64": crate::util::b64_encode(&c.data), "next": c.next, "size": c.size}),
                    None,
                ),
                Err(e) => fail(e),
            }
        }
        "stop" => {
            let slot = match slot_arg(&v, slots) {
                Ok(s) => s,
                Err(e) => return (e, None),
            };
            b.stop(slot);
            (json!({"ok": true}), None)
        }
        _ => fail(format!("no op {:?}", op)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::{Chunk, Status};
    use crate::files::Files;
    use std::collections::HashMap;
    use std::io::Read;
    use std::sync::Mutex;

    /// Hands out one end of a pair; keeps the other to talk to.
    struct Fake {
        far: Mutex<Vec<UnixStream>>,
        started: Mutex<Vec<(String, usize)>>,
    }

    impl Backend for Fake {
        fn start(&self, slot: &str, files: &Files) -> Result<(), String> {
            self.started
                .lock()
                .unwrap()
                .push((slot.to_string(), files.len()));
            Ok(())
        }
        fn connect(&self, _slot: &str) -> Result<UnixStream, String> {
            let (a, b) = UnixStream::pair().map_err(|e| e.to_string())?;
            self.far.lock().unwrap().push(b);
            Ok(a)
        }
        fn status(&self, slots: &[String]) -> HashMap<String, Status> {
            slots
                .iter()
                .map(|s| {
                    (
                        s.clone(),
                        Status {
                            running: true,
                            exit: None,
                            result: None,
                        },
                    )
                })
                .collect()
        }
        fn log(&self, slot: &str, offset: u64, _max: usize) -> Result<Chunk, String> {
            if slot == "s01" {
                // half of é, and a byte that is no UTF-8 at all: they arrive as they are
                return Ok(Chunk {
                    data: vec![b'a', 0xc3, 0xff],
                    next: offset + 3,
                    size: offset + 3,
                });
            }
            Ok(Chunk {
                data: "héllo\n".as_bytes().to_vec(),
                next: offset + 7,
                size: offset + 7,
            })
        }
        fn stop(&self, _slot: &str) {}
        fn stop_all(&self) {}
    }

    fn up(name: &str) -> (Arc<Fake>, crate::client::SpawnerClient) {
        let sock = std::env::temp_dir().join(format!("qp-sp-{}-{}.sock", name, std::process::id()));
        let _ = std::fs::remove_file(&sock);
        let l = UnixListener::bind(&sock).unwrap();
        let f = Arc::new(Fake {
            far: Mutex::new(Vec::new()),
            started: Mutex::new(Vec::new()),
        });
        let me = unsafe { libc::geteuid() };
        let b: Arc<dyn Backend> = f.clone();
        std::thread::spawn(move || serve(l, b, vec!["s01".into(), "s02".into()], vec![me]));
        (f, crate::client::SpawnerClient { socket: sock })
    }

    #[test]
    fn the_protocol_round_trips() {
        let (f, c) = up("rt");
        let files = vec![("main.qwe".to_string(), "x".to_string())];
        c.start("s01", &files).unwrap();
        assert_eq!(f.started.lock().unwrap()[0], ("s01".to_string(), 1));
        assert!(c.start("s09", &files).unwrap_err().contains("no slot"));
        assert!(c.start("../s01", &files).is_err());
        // the spawner checks the files itself
        assert!(c
            .start("s01", &vec![("../x".to_string(), "x".to_string())])
            .is_err());
        let mut s = c.connect("s01").unwrap();
        s.write_all(b"ping").unwrap();
        let mut far = f.far.lock().unwrap().pop().unwrap();
        let mut got = [0u8; 4];
        far.read_exact(&mut got).unwrap();
        assert_eq!(&got, b"ping");
        far.write_all(b"pong").unwrap();
        s.read_exact(&mut got).unwrap();
        assert_eq!(&got, b"pong");
        assert!(c.connect("s05").is_err());
        let st = c.status(&["s01".into(), "s07".into()]);
        assert_eq!(st.len(), 1);
        assert!(st["s01"].running);
        let l = c.log("s02", 10, 100).unwrap();
        assert_eq!(l.data, "héllo\n".as_bytes());
        assert_eq!(l.next, 17);
        // review L7: bytes that are not UTF-8 are not turned into U+FFFD on the way
        let l = c.log("s01", 0, 100).unwrap();
        assert_eq!(l.data, vec![b'a', 0xc3, 0xff]);
        c.stop("s01");
    }

    #[test]
    fn bad_lines_are_answered() {
        let (_f, c) = up("bad");
        let ask = |line: &[u8]| {
            let mut s = UnixStream::connect(&c.socket).unwrap();
            s.write_all(line).unwrap();
            s.shutdown(std::net::Shutdown::Write).unwrap();
            let mut out = String::new();
            s.read_to_string(&mut out).unwrap();
            out
        };
        assert!(ask(b"nope\n").contains("not JSON"));
        assert!(ask(b"{\"op\":\"fly\"}\n").contains("no op"));
        assert!(ask(b"{\"op\":\"status\"}\n").contains("slot or slots"));
        assert!(
            ask(b"{\"op\":\"log\",\"slot\":\"s01\"").contains("one line"),
            "no newline: refused"
        );
    }
}
