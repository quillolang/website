//! The server's programs: each slot a transient systemd unit (see sandbox.rs), run by
//! the spawner as root. Linux only.

use crate::backend::{read_log_file, Backend, Chunk, Status};
use crate::config::Config;
use crate::files::{remove_tree, write_tree, Files};
use crate::sandbox::{cgroup_names_unit, parse_show, status_of};
use std::collections::HashMap;
use std::ffi::CString;
use std::fs::{self, DirBuilder};
use std::io;
use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
use std::os::unix::io::{AsRawFd, FromRawFd, OwnedFd};
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;

pub struct SystemdBackend {
    cfg: Config,
    ids: HashMap<String, (u32, u32)>,
    locks: HashMap<String, Mutex<()>>,
    pids: Mutex<HashMap<String, i32>>,
}

#[repr(C)]
struct OpenHow {
    flags: u64,
    mode: u64,
    resolve: u64,
}
const RESOLVE_NO_MAGICLINKS: u64 = 0x02;
const RESOLVE_NO_SYMLINKS: u64 = 0x04;
const RESOLVE_BENEATH: u64 = 0x08;

impl SystemdBackend {
    pub fn new(cfg: &Config) -> Result<SystemdBackend, String> {
        let mut ids = HashMap::new();
        for s in &cfg.slots {
            let u = cfg.slot_user(s);
            let id = crate::util::user_ids(&u)
                .ok_or_else(|| format!("there is no user {} (run play/deploy/setup.sh)", u))?;
            if id.0 == 0 {
                return Err(format!("{} is root", u));
            }
            ids.insert(s.clone(), id);
        }
        let locks = cfg
            .slots
            .iter()
            .map(|s| (s.clone(), Mutex::new(())))
            .collect();
        let b = SystemdBackend {
            cfg: cfg.clone(),
            ids,
            locks,
            pids: Mutex::new(HashMap::new()),
        };
        b.layout()
            .map_err(|e| format!("cannot make {}: {}", cfg.root.display(), e))?;
        Ok(b)
    }

    fn path(&self, rel: &str) -> PathBuf {
        self.cfg.root.join(rel)
    }

    /// src/ log/ bin/ and the sandbox's empty root, with what is mounted on it.
    fn layout(&self) -> io::Result<()> {
        let dir = |p: PathBuf, mode: u32| -> io::Result<()> {
            match fs::symlink_metadata(&p) {
                Ok(m) if m.is_dir() => {}
                Ok(_) => return Err(io::Error::other(format!("{} is not a folder", p.display()))),
                Err(_) => DirBuilder::new().mode(mode).create(&p)?,
            }
            fs::set_permissions(&p, fs::Permissions::from_mode(mode))
        };
        dir(self.cfg.root.clone(), 0o711)?;
        dir(self.path("src"), 0o711)?;
        dir(self.path("log"), 0o700)?;
        dir(self.path("bin"), 0o755)?;
        let r = self.path("root");
        dir(r.clone(), 0o755)?;
        for d in [
            "usr", "etc", "proc", "sys", "dev", "tmp", "src", "work", "opt", "run", "var",
        ] {
            dir(r.join(d), 0o755)?;
        }
        for (l, t) in [
            ("bin", "usr/bin"),
            ("sbin", "usr/sbin"),
            ("lib", "usr/lib"),
            ("lib64", "usr/lib64"),
        ] {
            let p = r.join(l);
            if fs::symlink_metadata(&p).is_err() {
                std::os::unix::fs::symlink(t, &p)?;
            }
        }
        for f in ["etc/ld.so.cache", "etc/localtime", "opt/quillo"] {
            let p = r.join(f);
            if fs::symlink_metadata(&p).is_err() {
                fs::write(&p, b"")?;
            }
        }
        if fs::metadata(self.path("bin/quillo")).is_err() {
            eprintln!(
                "quillo-play: warning: {} is missing; runs fail until it is there",
                self.path("bin/quillo").display()
            );
        }
        Ok(())
    }

    fn systemctl(&self, args: &[&str]) -> io::Result<std::process::Output> {
        Command::new(&self.cfg.systemctl).args(args).output()
    }

    fn unit_name(slot: &str) -> String {
        format!("{}.service", crate::sandbox::unit(slot))
    }

    fn show(&self, slots: &[String], props: &str) -> Vec<HashMap<String, String>> {
        let mut args: Vec<String> = vec![
            "show".into(),
            "--no-pager".into(),
            format!("--property={}", props),
        ];
        args.extend(slots.iter().map(|s| Self::unit_name(s)));
        let a: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        match self.systemctl(&a) {
            Ok(o) => parse_show(&String::from_utf8_lossy(&o.stdout)),
            Err(_) => Vec::new(),
        }
    }

    fn main_pid(&self, slot: &str) -> Option<i32> {
        let s = self.show(&[slot.to_string()], "MainPID");
        s.first()?.get("MainPID")?.parse().ok().filter(|p| *p > 0)
    }

    fn halt(&self, slot: &str) {
        let u = Self::unit_name(slot);
        let _ = self.systemctl(&["stop", "--quiet", &u]);
        let _ = self.systemctl(&["reset-failed", "--quiet", &u]);
        self.pids.lock().unwrap().remove(slot);
    }

    fn known(&self, slot: &str) -> Result<(u32, u32), String> {
        self.ids
            .get(slot)
            .copied()
            .ok_or_else(|| format!("no slot {:?}", slot))
    }

    /// A connection to the socket in the sandbox, opened without following any link
    /// the program may have put there, checked to be the slot's own program.
    fn connect_pid(&self, slot: &str, pid: i32, uid: u32) -> Result<UnixStream, String> {
        let root = CString::new(format!("/proc/{}/root", pid)).unwrap();
        // the magic link /proc/<pid>/root is ours to follow: it is the sandbox's root
        let dfd = unsafe {
            libc::open(
                root.as_ptr(),
                libc::O_PATH | libc::O_DIRECTORY | libc::O_CLOEXEC,
            )
        };
        if dfd < 0 {
            return Err(format!(
                "no root for {}: {}",
                pid,
                io::Error::last_os_error()
            ));
        }
        let dfd = unsafe { OwnedFd::from_raw_fd(dfd) };
        let name = CString::new("work/app.sock").unwrap();
        let how = OpenHow {
            flags: (libc::O_PATH | libc::O_CLOEXEC | libc::O_NOFOLLOW) as u64,
            mode: 0,
            resolve: RESOLVE_NO_SYMLINKS | RESOLVE_NO_MAGICLINKS | RESOLVE_BENEATH,
        };
        let fd = unsafe {
            libc::syscall(
                libc::SYS_openat2,
                dfd.as_raw_fd(),
                name.as_ptr(),
                &how as *const OpenHow,
                std::mem::size_of::<OpenHow>(),
            )
        };
        if fd < 0 {
            return Err(format!("no socket yet: {}", io::Error::last_os_error()));
        }
        let fd = unsafe { OwnedFd::from_raw_fd(fd as i32) };
        let mut st: libc::stat = unsafe { std::mem::zeroed() };
        if unsafe { libc::fstat(fd.as_raw_fd(), &mut st) } != 0 {
            return Err(io::Error::last_os_error().to_string());
        }
        if st.st_mode & libc::S_IFMT != libc::S_IFSOCK || st.st_uid != uid {
            return Err("work/app.sock is not the program's socket".into());
        }
        let s = UnixStream::connect(format!("/proc/self/fd/{}", fd.as_raw_fd()))
            .map_err(|e| e.to_string())?;
        let c = crate::util::peer_cred(s.as_raw_fd()).map_err(|e| e.to_string())?;
        if c.uid != uid {
            return Err(format!(
                "the socket's listener is uid {}, not the slot's",
                c.uid
            ));
        }
        let cg =
            fs::read_to_string(format!("/proc/{}/cgroup", c.pid)).map_err(|e| e.to_string())?;
        if !cgroup_names_unit(&cg, &crate::sandbox::unit(slot)) {
            return Err("the socket's listener is not in the slot's unit".into());
        }
        Ok(s)
    }
}

impl Backend for SystemdBackend {
    fn start(&self, slot: &str, files: &Files) -> Result<(), String> {
        let (uid, gid) = self.known(slot)?;
        let _g = self.locks[slot].lock().unwrap();
        self.halt(slot);
        let src = self.path(&format!("src/{}", slot));
        remove_tree(&src).map_err(|e| format!("cannot clear {}: {}", src.display(), e))?;
        write_tree(&src, files, Some((0, gid)), 0o750, 0o640)
            .map_err(|e| format!("cannot write the files: {}", e))?;
        // the last run's output goes now, not when systemd truncates it at the start
        let _ = fs::remove_file(self.path(&format!("log/{}.log", slot)));
        let args = crate::sandbox::run_args(&self.cfg, slot, uid, gid);
        let o = Command::new(&self.cfg.systemd_run)
            .args(&args)
            .output()
            .map_err(|e| format!("cannot run systemd-run: {}", e))?;
        if !o.status.success() {
            return Err(format!(
                "systemd-run: {}",
                String::from_utf8_lossy(&o.stderr).trim()
            ));
        }
        if let Some(pid) = self.main_pid(slot) {
            self.pids.lock().unwrap().insert(slot.to_string(), pid);
        }
        Ok(())
    }

    fn connect(&self, slot: &str) -> Result<UnixStream, String> {
        let (uid, _) = self.known(slot)?;
        let cached = self.pids.lock().unwrap().get(slot).copied();
        if let Some(pid) = cached {
            if let Ok(s) = self.connect_pid(slot, pid, uid) {
                return Ok(s);
            }
        }
        let pid = self.main_pid(slot).ok_or("the program is not running")?;
        self.pids.lock().unwrap().insert(slot.to_string(), pid);
        self.connect_pid(slot, pid, uid)
    }

    fn status(&self, slots: &[String]) -> HashMap<String, Status> {
        let slots: Vec<String> = slots
            .iter()
            .filter(|s| self.ids.contains_key(*s))
            .cloned()
            .collect();
        let mut out = HashMap::new();
        if slots.is_empty() {
            return out;
        }
        for p in self.show(
            &slots,
            "Id,LoadState,ActiveState,SubState,Result,ExecMainCode,ExecMainStatus",
        ) {
            if let Some(id) = p.get("Id") {
                if let Some(s) = slots.iter().find(|s| *id == Self::unit_name(s)) {
                    out.insert(s.clone(), status_of(&p));
                }
            }
        }
        for s in slots {
            out.entry(s).or_insert_with(Status::gone);
        }
        out
    }

    fn log(&self, slot: &str, offset: u64, max: usize) -> Result<Chunk, String> {
        self.known(slot)?;
        read_log_file(&self.path(&format!("log/{}.log", slot)), offset, max)
            .map_err(|e| e.to_string())
    }

    fn stop(&self, slot: &str) {
        if self.known(slot).is_err() {
            return;
        }
        let _g = self.locks[slot].lock().unwrap();
        self.halt(slot);
        let _ = remove_tree(&self.path(&format!("src/{}", slot)));
        let _ = fs::remove_file(self.path(&format!("log/{}.log", slot)));
    }

    fn stop_all(&self) {
        let units: Vec<String> = self.cfg.slots.iter().map(|s| Self::unit_name(s)).collect();
        let mut a: Vec<&str> = vec!["stop", "--quiet"];
        a.extend(units.iter().map(|s| s.as_str()));
        let _ = self.systemctl(&a);
        let mut r: Vec<&str> = vec!["reset-failed", "--quiet"];
        r.extend(units.iter().map(|s| s.as_str()));
        let _ = self.systemctl(&r);
        for s in &self.cfg.slots {
            let _ = remove_tree(&self.path(&format!("src/{}", s)));
            let _ = fs::remove_file(self.path(&format!("log/{}.log", s)));
        }
        self.pids.lock().unwrap().clear();
    }
}
