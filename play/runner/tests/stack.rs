//! The proxy with real programs (the quillo on this machine), two ways: the dev backend
//! straight, and the dev backend behind the spawner's socket (as the server has the
//! systemd one), so the protocol and the socket handing are run too.

mod common;
use common::*;
use quillo_play::backend::Backend;
use quillo_play::config::{Config, Role};
use quillo_play::dev::DevBackend;
use quillo_play::proxy::Proxy;
use serde_json::json;
use std::net::{SocketAddr, TcpListener};
use std::sync::Arc;
use std::time::Duration;

struct Stack {
    api: SocketAddr,
    preview: SocketAddr,
    port: u16,
    dev: Arc<DevBackend>,
    /// The spawner's socket, when there is one: removed at the end.
    sock: Option<std::path::PathBuf>,
}

/// Stops the stack's programs when the test ends, a failing one too (the proxy's
/// threads hold the backend, so it is never dropped on its own).
impl Drop for Stack {
    fn drop(&mut self) {
        self.dev.stop_all();
        if let Some(p) = &self.sock {
            let _ = std::fs::remove_file(p);
        }
    }
}

fn cfg(name: &str, slots: usize) -> Config {
    let mut c = Config::defaults(Role::Dev);
    c.secret = SECRET.into();
    c.quillo = quillo().unwrap();
    c.dir = format!("/tmp/qp-{}-{}", name, std::process::id()).into();
    c.slots = quillo_play::config::slot_names(slots);
    c
}

fn stack(name: &str, slots: usize, through_spawner: bool) -> Stack {
    let mut c = cfg(name, slots);
    let api = TcpListener::bind("127.0.0.1:0").unwrap();
    let preview = TcpListener::bind("127.0.0.1:0").unwrap();
    c.public_port = Some(preview.local_addr().unwrap().port());
    c.finish().unwrap();
    let dev = Arc::new(DevBackend::new(&c).unwrap());
    let sock_path = through_spawner.then(|| c.dir.with_extension("sock"));
    let backend: Arc<dyn Backend> = if through_spawner {
        let sock = c.dir.with_extension("sock");
        let _ = std::fs::remove_file(&sock);
        let l = std::os::unix::net::UnixListener::bind(&sock).unwrap();
        let me = unsafe { libc::geteuid() };
        let (d, slots) = (dev.clone() as Arc<dyn Backend>, c.slots.clone());
        std::thread::spawn(move || quillo_play::spawner::serve(l, d, slots, vec![me]));
        Arc::new(quillo_play::client::SpawnerClient { socket: sock })
    } else {
        dev.clone()
    };
    let s = Stack {
        api: api.local_addr().unwrap(),
        preview: preview.local_addr().unwrap(),
        port: c.public_port.unwrap(),
        dev,
        sock: sock_path,
    };
    Proxy::new(c, backend).start(api, preview);
    s
}

fn host(s: &Stack, slot: &str) -> String {
    format!("{}.play.localhost:{}", slot, s.port)
}

fn run(s: &Stack, files: serde_json::Value, client: &str) -> Reply {
    api(
        s.api,
        "POST",
        "/run",
        Some(&json!({"files": files, "client": client})),
        Some(SECRET),
    )
}

/// The enter flow, as the editor's frame goes through it. Gives the host, the session's
/// token (the cookie) and the enter token (the link's).
fn enter(s: &Stack, r: &serde_json::Value) -> (String, String, String) {
    let token = r["session"].as_str().unwrap().to_string();
    let h = r["host"].as_str().unwrap();
    let host = format!("{}:{}", h, s.port);
    let enter = r["enter"].as_str().unwrap();
    // review L4: the link carries an enter token of its own, never the session's
    let e = enter
        .strip_prefix(&format!("http://{}/__play/enter?t=", host))
        .unwrap_or_else(|| panic!("{}", enter))
        .to_string();
    assert!(quillo_play::util::is_token(&e) && e != token, "{}", enter);
    // the link opened as a page is refused; in a frame it is taken (main session's addition)
    let page = get(
        s.preview,
        &host,
        &format!("/__play/enter?t={}", e),
        &[("Sec-Fetch-Dest", "document")],
    );
    assert_eq!(page.status, 403, "{}", page.head);
    let a = get(
        s.preview,
        &host,
        &format!("/__play/enter?t={}", e),
        &[("Sec-Fetch-Dest", "iframe")],
    );
    assert_eq!(a.status, 302, "{}", a.head);
    assert_eq!(
        a.header("location").unwrap(),
        format!("/__play/enter2?t={}", e)
    );
    assert_eq!(
        a.header("clear-site-data").unwrap(),
        "\"cache\", \"storage\""
    );
    // the session's token is not an enter token
    assert_eq!(
        get(s.preview, &host, &format!("/__play/enter2?t={}", token), &[]).status,
        403
    );
    assert_eq!(
        get(
            s.preview,
            &host,
            &format!("/__play/enter2?t={}", e),
            &[("Sec-Fetch-Dest", "empty")]
        )
        .status,
        403,
        "a fetch is no frame"
    );
    // a browser that says nothing of where a request goes is let in
    let b = get(s.preview, &host, &format!("/__play/enter2?t={}", e), &[]);
    assert_eq!(b.status, 302);
    assert_eq!(b.header("location").unwrap(), "/");
    assert_eq!(
        b.header("set-cookie").unwrap(),
        format!("play={}; Path=/; HttpOnly; SameSite=Lax", token)
    );
    // once: the link is used up
    for p in ["/__play/enter", "/__play/enter2"] {
        assert_eq!(
            get(s.preview, &host, &format!("{}?t={}", p, e), &[]).status,
            403,
            "{} again",
            p
        );
    }
    (host, token, e)
}

fn whole_run(through_spawner: bool) {
    let Some(_) = quillo() else {
        eprintln!("no quillo here (QUILLO_BIN or ~/.cargo/bin/quillo): skipped");
        return;
    };
    let name = if through_spawner { "spawn" } else { "direct" };
    let s = stack(name, 3, through_spawner);
    let d = s.dev.clone();
    let _deadline = Deadline::new(90, "stack", move || d.stop_all());

    // the API wants its secret
    assert_eq!(api(s.api, "GET", "/health", None, None).status, 401);
    assert_eq!(
        api(
            s.api,
            "GET",
            "/health",
            None,
            Some("test-secret-012345678X")
        )
        .status,
        401
    );
    assert_eq!(
        api(s.api, "GET", "/health", None, Some(SECRET)).json(),
        json!({"slots": 3, "busy": 0})
    );
    assert_eq!(api(s.api, "GET", "/nope", None, Some(SECRET)).status, 404);
    assert_eq!(api(s.api, "GET", "/run", None, Some(SECRET)).status, 405);
    // bad files
    let bad = run(&s, json!({"lib/x.qwe": "x"}), "ip:1");
    assert_eq!(bad.status, 400);
    assert!(bad.json()["error"].as_str().unwrap().contains("main.qwe"));
    assert_eq!(
        run(&s, json!({"main.qwe": "x"}), "").status,
        400,
        "a client is named"
    );

    let r = run(&s, json!({"main.qwe": PROGRAM}), "ip:1");
    assert_eq!(r.status, 200, "{}", r.body);
    let v = r.json();
    assert_eq!(v["running"], json!(true), "{}", v);
    assert_eq!(v["host"], json!("s01.play.localhost"));
    assert!(v["log"].is_array() && v["next"].is_u64(), "{}", v);
    let (host, token, enter_token) = enter(&s, &v);
    let cookie = format!("play={}", token);

    let page = get(s.preview, &host, "/", &[("Cookie", &cookie)]);
    assert_eq!(page.status, 200, "{}\n{}", page.head, page.body);
    // reviews M2 and L2: never kept by a browser, never a second answer
    assert_eq!(page.header("cache-control").unwrap(), "no-store");
    assert_eq!(page.header("connection").unwrap(), "close");
    assert!(page.body.contains("Counter page"), "{}", page.body);
    // the editor may frame it, nothing else: quillo's SAMEORIGIN is gone
    assert!(page.header("x-frame-options").is_none(), "{}", page.head);
    assert_eq!(
        page.header("content-security-policy").unwrap(),
        "frame-ancestors http://play.localhost:8080"
    );

    // without the cookie, with another, on another slot, on another host
    let no = get(s.preview, &host, "/", &[]);
    assert_eq!(no.status, 403);
    assert!(no.body.contains("another session"));
    assert_eq!(
        get(
            s.preview,
            &host,
            "/",
            &[("Cookie", "play=00000000000000000000000000000000")]
        )
        .status,
        403
    );
    assert_eq!(
        get(
            s.preview,
            &host,
            &format!("/__play/enter?t={}x", token),
            &[]
        )
        .status,
        403
    );
    assert_eq!(get(s.preview, &host, "/__play/enter", &[]).status, 403);
    assert_eq!(
        get(s.preview, &host, "/__play/other", &[("Cookie", &cookie)]).status,
        404
    );
    let other = get(s.preview, &host_of(&s, "s02"), "/", &[("Cookie", &cookie)]);
    assert_eq!(other.status, 404);
    assert!(other.body.contains("has ended"));
    assert_eq!(
        get(s.preview, "evil.example", "/", &[("Cookie", &cookie)]).status,
        404
    );
    assert_eq!(
        parse(&raw(
            s.preview,
            b"GET / HTTP/1.1\r\nHost: a\r\nHost: b\r\n\r\n"
        ))
        .status,
        400
    );

    // the session cookie never reaches the program; its other cookies do
    let c = get(
        s.preview,
        &host,
        "/cookies",
        &[("Cookie", &format!("a=1; {}; b=2", cookie))],
    );
    assert_eq!(c.body, "a=1; b=2");
    // the program's cookie stays on its host; its Clear-Site-Data never reaches the browser
    let sc = get(s.preview, &host, "/setcookie", &[("Cookie", &cookie)]);
    let set = sc.header("set-cookie").unwrap();
    assert!(
        set.starts_with("pref=1") && !set.to_ascii_lowercase().contains("domain"),
        "{}",
        set
    );
    let cl = get(s.preview, &host, "/clear", &[("Cookie", &cookie)]);
    assert_eq!(cl.body, "cleared");
    assert!(cl.header("clear-site-data").is_none(), "{}", cl.head);
    // dev mode: X-Forwarded-For is the TCP peer, not what was sent
    let ip = get(
        s.preview,
        &host,
        "/ip",
        &[("Cookie", &cookie), ("X-Forwarded-For", "6.6.6.6")],
    );
    assert_eq!(ip.body, "127.0.0.1", "{}", ip.head);

    // a WebSocket goes through whole: quillo --watch's reload channel answers 101, then
    // sends the program's version as a text frame
    {
        use std::io::{Read, Write};
        let mut ws = std::net::TcpStream::connect(s.preview).unwrap();
        ws.set_read_timeout(Some(Duration::from_secs(10))).unwrap();
        let req = format!("GET /_quillo/events?v=0 HTTP/1.1\r\nHost: {}\r\nCookie: {}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n", host, cookie);
        ws.write_all(req.as_bytes()).unwrap();
        let mut got = Vec::new();
        let mut b = [0u8; 4096];
        while !got.windows(4).any(|w| w == b"\r\n\r\n") {
            let n = ws.read(&mut b).unwrap();
            assert!(
                n > 0,
                "closed before the head: {:?}",
                String::from_utf8_lossy(&got)
            );
            got.extend_from_slice(&b[..n]);
        }
        let text = String::from_utf8_lossy(&got).to_string();
        assert!(text.starts_with("HTTP/1.1 101"), "{}", text);
        assert!(
            text.to_ascii_lowercase()
                .contains("sec-websocket-accept: s3pplmbitxaq9kygzzhzrbk+xoo="),
            "{}",
            text
        );
        let end = got.windows(4).position(|w| w == b"\r\n\r\n").unwrap() + 4;
        let mut frame = got[end..].to_vec();
        while frame.is_empty() {
            let n = ws.read(&mut b).unwrap();
            assert!(n > 0, "closed before a frame");
            frame.extend_from_slice(&b[..n]);
        }
        assert_eq!(frame[0], 0x81, "a text frame: {:?}", frame);
    }

    // two requests in one write: the program answers the first and closes
    let two = format!("GET / HTTP/1.1\r\nHost: {h}\r\nCookie: {c}\r\n\r\nGET /cookies HTTP/1.1\r\nHost: {h}\r\nCookie: {c}\r\n\r\n", h = host, c = cookie);
    let both = raw(s.preview, two.as_bytes());
    assert_eq!(both.matches("HTTP/1.1 ").count(), 1, "{}", both);

    // what it printed
    let log = api(
        s.api,
        "GET",
        &format!("/log?session={}&after=0", token),
        None,
        Some(SECRET),
    )
    .json();
    assert_eq!(log["running"], json!(true));
    let text: Vec<String> = log["lines"]
        .as_array()
        .unwrap()
        .iter()
        .map(|l| l["text"].as_str().unwrap().to_string())
        .collect();
    assert!(
        text.iter().any(|l| l.contains("hello from the program")),
        "{:?}",
        text
    );
    // the enter token is in /run's answer only (main session's addition)
    assert!(!log.to_string().contains(&enter_token));
    let next = log["next"].as_u64().unwrap();
    let again = api(
        s.api,
        "GET",
        &format!("/log?session={}&after={}", token, next),
        None,
        Some(SECRET),
    )
    .json();
    assert_eq!(again["next"].as_u64().unwrap(), next);
    assert_eq!(
        api(
            s.api,
            "GET",
            "/log?session=00000000000000000000000000000000",
            None,
            Some(SECRET)
        )
        .status,
        404
    );
    assert_eq!(
        api(s.api, "GET", "/health", None, Some(SECRET)).json()["busy"],
        json!(1)
    );

    // the same client again: the same slot, the old session ended
    let r2 = run(&s, json!({"main.qwe": PROGRAM}), "ip:1").json();
    assert_eq!(r2["host"], json!("s01.play.localhost"));
    let old = api(
        s.api,
        "GET",
        &format!("/log?session={}&after=0", token),
        None,
        Some(SECRET),
    )
    .json();
    assert_eq!(old["running"], json!(false));
    assert!(
        old["lines"]
            .as_array()
            .unwrap()
            .iter()
            .any(|l| l["text"].as_str().unwrap().contains("newer run")),
        "{}",
        old
    );
    assert_eq!(
        get(s.preview, &host, "/", &[("Cookie", &cookie)]).status,
        403,
        "the old cookie is not the new session's"
    );
    let token2 = r2["session"].as_str().unwrap().to_string();

    // another client: another slot
    let r3 = run(&s, json!({"main.qwe": PROGRAM}), "ip:2").json();
    assert_eq!(r3["host"], json!("s02.play.localhost"));

    // stop: the preview has ended, the output stays readable
    assert_eq!(
        api(
            s.api,
            "POST",
            "/stop",
            Some(&json!({"session": token2})),
            Some(SECRET)
        )
        .json(),
        json!({})
    );
    let ended = get(
        s.preview,
        &host,
        "/",
        &[("Cookie", &format!("play={}", token2))],
    );
    assert_eq!(ended.status, 404);
    assert!(ended.body.contains("has ended"));
    let l = api(
        s.api,
        "GET",
        &format!("/log?session={}&after=0", token2),
        None,
        Some(SECRET),
    )
    .json();
    assert_eq!(l["running"], json!(false));
    assert_eq!(
        l["lines"].as_array().unwrap().last().unwrap()["text"],
        json!("[stopped]")
    );
    assert_eq!(
        api(
            s.api,
            "POST",
            "/stop",
            Some(&json!({"session": "nope"})),
            Some(SECRET)
        )
        .json(),
        json!({})
    );

    // a program with no routes: under --watch it prints and keeps watching
    let e = run(&s, json!({"main.qwe": "print(\"bye\")\n"}), "ip:3").json();
    assert_eq!(e["running"], json!(true), "{}", e);
    let t: Vec<&str> = e["log"]
        .as_array()
        .unwrap()
        .iter()
        .map(|l| l["text"].as_str().unwrap())
        .collect();
    assert!(t.contains(&"bye"), "{:?}", t);

    // a program with an error: under --watch it waits for a fix, and the answer comes
    // as soon as quillo says so, with the error in the output
    let t0 = std::time::Instant::now();
    let bad = run(&s, json!({"main.qwe": "route GET / = nope(\n"}), "ip:4").json();
    assert!(
        t0.elapsed() < Duration::from_secs(4),
        "took {:?}",
        t0.elapsed()
    );
    assert_eq!(bad["running"], json!(true), "{}", bad);
    let t: Vec<&str> = bad["log"]
        .as_array()
        .unwrap()
        .iter()
        .map(|l| l["text"].as_str().unwrap())
        .collect();
    assert!(
        t.iter().any(|l| l.starts_with("main.qwe:2: error:")),
        "{:?}",
        t
    );

    s.dev.stop_all();
}

fn host_of(s: &Stack, slot: &str) -> String {
    host(s, slot)
}

#[test]
fn a_whole_run_through_the_dev_backend() {
    whole_run(false);
}

#[test]
fn a_whole_run_through_the_spawners_socket() {
    whole_run(true);
}

#[test]
fn busy_when_the_slots_are_taken() {
    if quillo().is_none() {
        return;
    }
    let s = stack("busy", 1, false);
    let d = s.dev.clone();
    let _deadline = Deadline::new(60, "busy", move || d.stop_all());
    assert_eq!(run(&s, json!({"main.qwe": PROGRAM}), "ip:1").status, 200);
    let b = run(&s, json!({"main.qwe": PROGRAM}), "ip:2");
    assert_eq!(b.status, 503);
    assert!(b.json()["error"].as_str().unwrap().contains("busy"));
    s.dev.stop_all();
}

#[test]
fn an_idle_session_ends() {
    if quillo().is_none() {
        return;
    }
    let mut c = cfg("idle", 1);
    c.idle = Duration::from_secs(1);
    let api_l = TcpListener::bind("127.0.0.1:0").unwrap();
    let pre_l = TcpListener::bind("127.0.0.1:0").unwrap();
    c.public_port = Some(pre_l.local_addr().unwrap().port());
    c.finish().unwrap();
    let dev = Arc::new(DevBackend::new(&c).unwrap());
    let d = dev.clone();
    let _deadline = Deadline::new(60, "idle", move || d.stop_all());
    struct Stop(Arc<DevBackend>);
    impl Drop for Stop {
        fn drop(&mut self) {
            self.0.stop_all();
        }
    }
    let _stop = Stop(dev.clone());
    let api_a = api_l.local_addr().unwrap();
    Proxy::new(c, dev.clone()).start(api_l, pre_l);
    let r = api(
        api_a,
        "POST",
        "/run",
        Some(&json!({"files": {"main.qwe": PROGRAM}, "client": "ip:1"})),
        Some(SECRET),
    )
    .json();
    let token = r["session"].as_str().unwrap().to_string();
    let ok = quillo_play::dev::wait_until(Duration::from_secs(15), || {
        let l = api(
            api_a,
            "GET",
            &format!("/log?session={}&after=0", token),
            None,
            Some(SECRET),
        )
        .json();
        // each /log poll counts as seen: poll slowly
        std::thread::sleep(Duration::from_millis(1500));
        l["running"] == json!(false)
    });
    // a poll touches the session; with polls 1.5 s apart and idle at 1 s, the reaper (every 2 s) ends it
    assert!(ok, "the idle session was not ended");
    let l = api(
        api_a,
        "GET",
        &format!("/log?session={}&after=0", token),
        None,
        Some(SECRET),
    )
    .json();
    assert!(
        l["lines"]
            .as_array()
            .unwrap()
            .iter()
            .any(|x| x["text"].as_str().unwrap().contains("nothing asked for it")),
        "{}",
        l
    );
    dev.stop_all();
}
