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
    assert_eq!(
        r["enter"],
        json!(format!("http://{}/__play/enter?t={}", host, token))
    );
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
