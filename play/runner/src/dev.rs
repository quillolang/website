//! Dev mode's programs: plain child processes, NO SANDBOX. Only for working on the
//! editor locally, bound to 127.0.0.1.

use crate::backend::{read_log_file, Backend, Chunk, Status};
use crate::config::Config;
use crate::files::{remove_tree, write_tree, Files};
use std::collections::HashMap;
use std::fs::{DirBuilder, OpenOptions};
use std::os::unix::fs::DirBuilderExt;
use std::os::unix::net::UnixStream;
use std::os::unix::process::{CommandExt, ExitStatusExt};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub struct DevBackend {
    quillo: PathBuf,
    dir: PathBuf,
    cfg: Config,
    kids: Mutex<HashMap<String, Kid>>,
}

struct Kid {
    child: Child,
    exit: Option<Status>,
}

/// The command line of a slot's program (the server's sandbox runs the same one).
pub fn program_args(cfg: &Config, slot: &str, socket: &str) -> Vec<String> {
    vec![
        "run".into(),
        "--watch".into(),
        "--listen".into(),
        format!("unix:{}", socket),
        "--allowed-hosts".into(),
        cfg.host(slot),
        "--trust-proxy".into(),
        "127.0.0.1".into(),
        "--max-compute".into(),
        cfg.max_compute.clone(),
        "--max-body".into(),
        cfg.max_body.clone(),
        "main.qwe".into(),
    ]
}

fn exit_of(s: std::process::ExitStatus) -> Status {
    match (s.code(), s.signal()) {
        (Some(c), _) => Status {
            running: false,
            exit: Some(c),
            result: Some(if c == 0 { "success" } else { "exit-code" }.into()),
        },
        (None, Some(sig)) => Status {
            running: false,
            exit: Some(128 + sig),
            result: Some("signal".into()),
        },
        _ => Status::gone(),
    }
}

impl DevBackend {
    pub fn new(cfg: &Config) -> std::io::Result<DevBackend> {
        let _ = remove_tree(&cfg.dir);
        DirBuilder::new()
            .mode(0o700)
            .recursive(true)
            .create(&cfg.dir)?;
        Ok(DevBackend {
            quillo: cfg.quillo.clone(),
            dir: cfg.dir.clone(),
            cfg: cfg.clone(),
            kids: Mutex::new(HashMap::new()),
        })
    }

    fn slot_dir(&self, slot: &str) -> PathBuf {
        self.dir.join(slot)
    }

    fn kill(kid: &mut Kid) {
        let pid = kid.child.id() as i32;
        if kid.child.try_wait().ok().flatten().is_none() {
            unsafe {
                libc::kill(-pid, libc::SIGKILL);
            }
        }
        let _ = kid.child.wait();
        // the group may hold more than the child (anything quillo started)
        unsafe {
            libc::kill(-pid, libc::SIGKILL);
        }
    }

    fn known(&self, slot: &str) -> Result<(), String> {
        if self.cfg.slots.iter().any(|s| s == slot) {
            Ok(())
        } else {
            Err(format!("no slot {:?}", slot))
        }
    }
}

impl Backend for DevBackend {
    fn start(&self, slot: &str, files: &Files) -> Result<(), String> {
        self.known(slot)?;
        let mut kids = self.kids.lock().unwrap();
        if let Some(mut k) = kids.remove(slot) {
            DevBackend::kill(&mut k);
        }
        let d = self.slot_dir(slot);
        remove_tree(&d).map_err(|e| e.to_string())?;
        DirBuilder::new()
            .mode(0o700)
            .create(&d)
            .map_err(|e| e.to_string())?;
        let work = d.join("work");
        write_tree(&work, files, None, 0o700, 0o600)
            .map_err(|e| format!("cannot write the files: {}", e))?;
        let log = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(d.join("out.log"))
            .map_err(|e| e.to_string())?;
        let err = log.try_clone().map_err(|e| e.to_string())?;
        let child = Command::new(&self.quillo)
            .args(program_args(&self.cfg, slot, "app.sock"))
            .current_dir(&work)
            .env("QUILLO_JIT", "0")
            .stdin(Stdio::null())
            .stdout(Stdio::from(log))
            .stderr(Stdio::from(err))
            .process_group(0)
            .spawn()
            .map_err(|e| format!("cannot start {}: {}", self.quillo.display(), e))?;
        kids.insert(slot.to_string(), Kid { child, exit: None });
        Ok(())
    }

    fn connect(&self, slot: &str) -> Result<UnixStream, String> {
        self.known(slot)?;
        UnixStream::connect(self.slot_dir(slot).join("work/app.sock")).map_err(|e| e.to_string())
    }

    fn status(&self, slots: &[String]) -> HashMap<String, Status> {
        let mut kids = self.kids.lock().unwrap();
        let mut out = HashMap::new();
        for s in slots {
            let st = match kids.get_mut(s) {
                None => Status::gone(),
                Some(k) => {
                    if k.exit.is_none() {
                        if let Ok(Some(e)) = k.child.try_wait() {
                            k.exit = Some(exit_of(e));
                        }
                    }
                    k.exit.clone().unwrap_or(Status {
                        running: true,
                        exit: None,
                        result: None,
                    })
                }
            };
            out.insert(s.clone(), st);
        }
        out
    }

    fn log(&self, slot: &str, offset: u64, max: usize) -> Result<Chunk, String> {
        self.known(slot)?;
        read_log_file(&self.slot_dir(slot).join("out.log"), offset, max).map_err(|e| e.to_string())
    }

    fn stop(&self, slot: &str) {
        if self.known(slot).is_err() {
            return;
        }
        if let Some(mut k) = self.kids.lock().unwrap().remove(slot) {
            DevBackend::kill(&mut k);
        }
        let _ = remove_tree(&self.slot_dir(slot));
    }

    fn stop_all(&self) {
        let mut kids = self.kids.lock().unwrap();
        for (_, mut k) in kids.drain() {
            DevBackend::kill(&mut k);
        }
        let _ = remove_tree(&self.dir);
    }
}

impl Drop for DevBackend {
    fn drop(&mut self) {
        self.stop_all();
    }
}

/// Waits for `f` to hold, up to `max`.
pub fn wait_until(max: Duration, mut f: impl FnMut() -> bool) -> bool {
    let end = Instant::now() + max;
    loop {
        if f() {
            return true;
        }
        if Instant::now() >= end {
            return false;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Role;

    #[test]
    fn the_program_command_line() {
        let mut c = Config::defaults(Role::Dev);
        c.secret = crate::config::DEV_SECRET.into();
        c.finish().unwrap();
        let a = program_args(&c, "s03", "app.sock");
        assert_eq!(
            a.join(" "),
            "run --watch --listen unix:app.sock --allowed-hosts s03.play.localhost --trust-proxy 127.0.0.1 --max-compute 2s --max-body 1MB main.qwe"
        );
    }

    #[test]
    fn unknown_slots_are_refused() {
        let mut c = Config::defaults(Role::Dev);
        c.secret = crate::config::DEV_SECRET.into();
        c.dir = std::env::temp_dir().join(format!("qp-dev-unit-{}", std::process::id()));
        c.quillo = "/nonexistent/quillo".into();
        c.finish().unwrap();
        let b = DevBackend::new(&c).unwrap();
        let f = vec![("main.qwe".to_string(), "print(1)".to_string())];
        assert!(b.start("../x", &f).is_err());
        assert!(b.start("s99", &f).is_err());
        assert!(b.connect("s99").is_err());
        assert!(b.log("../../etc", 0, 10).is_err());
        // a quillo that is not there is an error, not a hang
        assert!(b.start("s01", &f).unwrap_err().contains("cannot start"));
        assert_eq!(b.status(&["s01".to_string()])["s01"], Status::gone());
        drop(b);
        assert!(!c.dir.exists());
    }
}
