//! The binary itself, in dev mode, with the quillo on this machine: it starts, runs a
//! program, and on SIGTERM stops it and exits.

mod common;
use common::*;
use serde_json::json;
use std::io::Read;
use std::net::{SocketAddr, TcpListener};
use std::os::unix::process::CommandExt;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}

/// The dev process, in a process group of its own: dropped, the group is killed.
struct Dev(std::process::Child);
impl Drop for Dev {
    fn drop(&mut self) {
        let pid = self.0.id() as i32;
        unsafe {
            libc::kill(-pid, libc::SIGKILL);
        }
        let _ = self.0.wait();
    }
}

#[test]
fn dev_mode_runs_a_program_and_stops_it_on_sigterm() {
    let Some(q) = quillo() else {
        eprintln!("no quillo here: skipped");
        return;
    };
    let (pa, pp) = (free_port(), free_port());
    let dir = format!("/tmp/qp-bin-{}", std::process::id());
    let child = Command::new(env!("CARGO_BIN_EXE_quillo-play"))
        .args([
            "dev",
            "--quillo",
            q.to_str().unwrap(),
            "--port-api",
            &pa.to_string(),
            "--port-preview",
            &pp.to_string(),
            "--dir",
            &dir,
            "--slots",
            "2",
        ])
        .env("PLAY_SECRET", SECRET)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .process_group(0)
        .spawn()
        .unwrap();
    let pgid = child.id() as i32;
    let mut dev = Dev(child);
    let _deadline = Deadline::new(60, "dev_mode", move || unsafe {
        libc::kill(-pgid, libc::SIGKILL);
    });
    let api_a: SocketAddr = format!("127.0.0.1:{}", pa).parse().unwrap();
    let pre_a: SocketAddr = format!("127.0.0.1:{}", pp).parse().unwrap();
    let up = quillo_play::dev::wait_until(Duration::from_secs(10), || {
        std::net::TcpStream::connect(api_a).is_ok()
    });
    assert!(up, "the API did not come up");
    assert_eq!(
        api(api_a, "GET", "/health", None, Some(SECRET)).json(),
        json!({"slots": 2, "busy": 0})
    );
    assert_eq!(
        api(
            api_a,
            "GET",
            "/health",
            None,
            Some(quillo_play::config::DEV_SECRET)
        )
        .status,
        401,
        "PLAY_SECRET is the secret, not the dev default"
    );

    let r = api(
        api_a,
        "POST",
        "/run",
        Some(&json!({"files": {"main.qwe": PROGRAM}, "client": "ip:1"})),
        Some(SECRET),
    )
    .json();
    let token = r["session"].as_str().unwrap();
    let host = format!("s01.play.localhost:{}", pp);
    // review L4: the link carries an enter token of its own, never the session's
    let enter = r["enter"].as_str().unwrap();
    let e = enter
        .strip_prefix(&format!("http://{}/__play/enter?t=", host))
        .unwrap_or_else(|| panic!("{}", enter));
    assert!(quillo_play::util::is_token(e) && e != token, "{}", enter);
    let page = get(pre_a, &host, "/", &[("Cookie", &format!("play={}", token))]);
    assert_eq!(page.status, 200);
    assert!(page.body.contains("Counter page"));
    let sock = std::path::PathBuf::from(&dir).join("s01/work/app.sock");
    assert!(sock.exists());

    // SIGTERM: the program is stopped, its folder removed, the process gone
    unsafe {
        libc::kill(dev.0.id() as i32, libc::SIGTERM);
    }
    let t = Instant::now();
    let mut exited = None;
    while t.elapsed() < Duration::from_secs(10) {
        if let Some(s) = dev.0.try_wait().unwrap() {
            exited = Some(s);
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    assert!(exited.is_some_and(|s| s.success()), "{:?}", exited);
    assert!(
        !std::path::Path::new(&dir).exists(),
        "the runs' folder is left"
    );
    assert!(
        std::os::unix::net::UnixStream::connect(&sock).is_err(),
        "the program still answers"
    );
    let mut err = String::new();
    dev.0
        .stderr
        .take()
        .unwrap()
        .read_to_string(&mut err)
        .unwrap();
    assert!(err.contains("NO SANDBOX"), "{}", err);
}

#[test]
fn dev_mode_refuses_other_addresses() {
    let o = Command::new(env!("CARGO_BIN_EXE_quillo-play"))
        .args(["dev", "--api", "0.0.0.0:4999"])
        .output()
        .unwrap();
    assert!(!o.status.success());
    assert!(String::from_utf8_lossy(&o.stderr).contains("127.0.0.1"));
    let o = Command::new(env!("CARGO_BIN_EXE_quillo-play"))
        .args(["fly"])
        .output()
        .unwrap();
    assert_eq!(o.status.code(), Some(2));
    let o = Command::new(env!("CARGO_BIN_EXE_quillo-play"))
        .args(["proxy", "--config", "/nonexistent"])
        .output()
        .unwrap();
    assert!(!o.status.success());
    #[cfg(not(target_os = "linux"))]
    {
        let o = Command::new(env!("CARGO_BIN_EXE_quillo-play"))
            .args(["spawner"])
            .output()
            .unwrap();
        assert!(String::from_utf8_lossy(&o.stderr).contains("Linux"));
    }
}

/// A spawner's socket that answers every request yes, and counts the stops it is asked for.
fn fake_spawner(path: &std::path::Path) -> std::sync::Arc<std::sync::Mutex<Vec<String>>> {
    use std::io::{BufRead, BufReader, Write};
    let _ = std::fs::remove_file(path);
    let l = std::os::unix::net::UnixListener::bind(path).unwrap();
    let ops = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let o = ops.clone();
    std::thread::spawn(move || {
        for c in l.incoming().flatten() {
            let mut line = String::new();
            if BufReader::new(&c).read_line(&mut line).is_err() {
                continue;
            }
            let v: serde_json::Value = serde_json::from_str(&line).unwrap_or_default();
            let op = v["op"].as_str().unwrap_or("").to_string();
            let slot = v["slot"].as_str().unwrap_or("").to_string();
            o.lock().unwrap().push(format!("{} {}", op, slot));
            let answer = if op == "status" { "{\"ok\":true,\"status\":{}}\n" } else { "{\"ok\":true}\n" };
            let _ = (&c).write_all(answer.as_bytes());
        }
    });
    ops
}

#[test]
fn the_proxy_stops_every_slot_on_sigterm() {
    // review L6: stopped (not restarted), the proxy stops its programs
    let (pa, pp) = (free_port(), free_port());
    let sock = std::path::PathBuf::from(format!("/tmp/qp-l6-{}.sock", std::process::id()));
    let ops = fake_spawner(&sock);
    let child = Command::new(env!("CARGO_BIN_EXE_quillo-play"))
        .args([
            "proxy",
            "--spawner",
            sock.to_str().unwrap(),
            "--port-api",
            &pa.to_string(),
            "--port-preview",
            &pp.to_string(),
            "--slots",
            "3",
        ])
        .env("PLAY_SECRET", SECRET)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
        .unwrap();
    let pgid = child.id() as i32;
    let mut proxy = Dev(child);
    let _deadline = Deadline::new(30, "proxy_sigterm", move || unsafe {
        libc::kill(-pgid, libc::SIGKILL);
    });
    let api_a: SocketAddr = format!("127.0.0.1:{}", pa).parse().unwrap();
    assert!(quillo_play::dev::wait_until(Duration::from_secs(10), || {
        std::net::TcpStream::connect(api_a).is_ok()
    }));
    let stops = |ops: &std::sync::Mutex<Vec<String>>| {
        ops.lock().unwrap().iter().filter(|o| o.starts_with("stop ")).count()
    };
    // at its start: whatever an earlier proxy left
    assert!(quillo_play::dev::wait_until(Duration::from_secs(5), || stops(&ops) >= 3));
    let before = stops(&ops);
    unsafe {
        libc::kill(proxy.0.id() as i32, libc::SIGTERM);
    }
    let t = Instant::now();
    let mut exited = None;
    while t.elapsed() < Duration::from_secs(10) {
        if let Some(s) = proxy.0.try_wait().unwrap() {
            exited = Some(s);
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    assert!(exited.is_some_and(|s| s.success()), "{:?}", exited);
    let after: Vec<String> = ops.lock().unwrap().iter().skip(before).filter(|o| o.starts_with("stop ")).cloned().collect();
    let mut after = after;
    after.sort();
    assert_eq!(after, vec!["stop s01", "stop s02", "stop s03"], "{:?}", ops.lock().unwrap());
    let _ = std::fs::remove_file(&sock);
}
