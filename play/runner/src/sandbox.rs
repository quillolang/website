//! The systemd-run command line of a slot's sandbox. Kept apart from the Linux-only
//! backend so it is tested everywhere. Everything in it comes from the settings (checked
//! in Config::finish) and the fixed slot list, never from a run's files.

use crate::backend::Status;
use crate::config::Config;
use std::collections::HashMap;

/// One line each: what the property guards against. The README lists the same.
pub fn properties(cfg: &Config, slot: &str, uid: u32, gid: u32) -> Vec<String> {
    let root = cfg.root.display().to_string();
    let user = cfg.slot_user(slot);
    let runtime = cfg.max_runtime.as_secs() + 60;
    let mut p: Vec<String> = vec![
        format!("Description=Quillo playground {}", slot),
        // the unit is "active" until its process has exec'd, and stays loaded after the
        // program ends, so its exit code can be read; the runner stops it.
        "Type=exec".into(),
        "RemainAfterExit=yes".into(),
        format!("User={}", user),
        format!("Group={}", user),
        // an empty root of its own: /usr read-only, its files at /src, quillo at /opt
        format!("RootDirectory={}/root", root),
        "BindReadOnlyPaths=/usr".into(),
        "BindReadOnlyPaths=/etc/ld.so.cache".into(),
        "BindReadOnlyPaths=/etc/localtime".into(),
        format!("BindReadOnlyPaths={}/src/{}:/src", root, slot),
        format!("BindReadOnlyPaths={}/bin/quillo:/opt/quillo", root),
        // where it runs and writes (its database too): memory, counted in MemoryMax
        format!("TemporaryFileSystem=/work:size={},mode=0700,uid={},gid={},noexec,nosuid,nodev", cfg.work_size, uid, gid),
        "Environment=HOME=/work".into(),
        "Environment=QUILLO_JIT=0".into(),
        format!("StandardOutput=truncate:{}/log/{}.log", root, slot),
        "StandardError=inherit".into(),
        "StandardInput=null".into(),
        // no network at all: it is reached through its Unix socket
        "PrivateNetwork=yes".into(),
        "RestrictAddressFamilies=AF_UNIX".into(),
        "IPAddressDeny=any".into(),
        // its share of the machine
        format!("MemoryMax={}", cfg.memory_max),
        "MemorySwapMax=0".into(),
        format!("CPUQuota={}", cfg.cpu_quota),
        "TasksMax=32".into(),
        "LimitNOFILE=256".into(),
        "LimitFSIZE=16M".into(),
        "LimitCORE=0".into(),
        format!("RuntimeMaxSec={}", runtime),
        "TimeoutStopSec=2s".into(),
        "OOMScoreAdjust=1000".into(),
        "Nice=10".into(),
        "IOWeight=10".into(),
        "CPUWeight=10".into(),
        // no way up, and little of the kernel to reach
        "NoNewPrivileges=yes".into(),
        "CapabilityBoundingSet=".into(),
        "AmbientCapabilities=".into(),
        "PrivateUsers=yes".into(),
        // /tmp and /var/tmp in memory, counted in MemoryMax: PrivateTmp's folders are on the
        // host's disk, with no limit but each file's (review H3)
        // Every place it can write is noexec: nothing written can be run (review L9).
        "TemporaryFileSystem=/tmp:size=16m,mode=1777,noexec,nosuid,nodev".into(),
        "TemporaryFileSystem=/var/tmp:size=16m,mode=1777,noexec,nosuid,nodev".into(),
        "PrivateDevices=yes".into(),
        // PrivateDevices keeps the host's /dev/shm and ptys: shared memory of its own, in memory
        // (review M7), and no device but these five, by the cgroup's device filter, so no pty
        // from the host's pool. (InaccessiblePaths=, NoExecPaths= and ExecPaths= were tried
        // first: with RootDirectory= they did not reach inside the sandbox, as the server's
        // probe showed, so mounts and the device policy do it.)
        "TemporaryFileSystem=/dev/shm:size=8m,mode=1777,noexec,nosuid,nodev".into(),
        "TemporaryFileSystem=/dev/pts:ro".into(),
        "DevicePolicy=strict".into(),
        "DeviceAllow=/dev/null rw".into(),
        "DeviceAllow=/dev/zero rw".into(),
        "DeviceAllow=/dev/full rw".into(),
        "DeviceAllow=/dev/random r".into(),
        "DeviceAllow=/dev/urandom r".into(),
        // /usr/local (the host's own tools) is an empty folder there (review L9)
        "TemporaryFileSystem=/usr/local:ro".into(),
        "PrivateIPC=yes".into(),
        "ProtectProc=invisible".into(),
        "ProcSubset=pid".into(),
        "ProtectKernelTunables=yes".into(),
        "ProtectKernelModules=yes".into(),
        "ProtectKernelLogs=yes".into(),
        "ProtectControlGroups=yes".into(),
        "ProtectClock=yes".into(),
        "ProtectHostname=yes".into(),
        "RestrictNamespaces=yes".into(),
        "RestrictSUIDSGID=yes".into(),
        "RestrictRealtime=yes".into(),
        "LockPersonality=yes".into(),
        "MemoryDenyWriteExecute=yes".into(),
        "RemoveIPC=yes".into(),
        "UMask=0077".into(),
        "KeyringMode=private".into(),
        "SystemCallArchitectures=native".into(),
        "SystemCallFilter=@system-service".into(),
        "SystemCallFilter=~@privileged @resources @mount @swap @reboot @raw-io @module @debug @cpu-emulation @obsolete @keyring".into(),
        // io_uring is in @system-service (@aio), and reached the kernel in the VPS probe: a common
        // way into kernel bugs, and nothing quillo uses.
        "SystemCallFilter=~io_uring_setup io_uring_enter io_uring_register".into(),
        "SystemCallErrorNumber=EPERM".into(),
    ];
    p.shrink_to_fit();
    p
}

/// The shell line the sandbox runs: its files copied into /work, then quillo.
pub fn command(cfg: &Config, slot: &str) -> String {
    let args = crate::dev::program_args(cfg, slot, "/work/app.sock");
    format!(
        "cp -R /src/. /work/ && cd /work && exec /opt/quillo {}",
        args.join(" ")
    )
}

pub fn unit(slot: &str) -> String {
    format!("quillo-play-{}", slot)
}

/// systemd-run's arguments.
pub fn run_args(cfg: &Config, slot: &str, uid: u32, gid: u32) -> Vec<String> {
    let mut a = vec![
        format!("--unit={}", unit(slot)),
        "--slice=quillo-play.slice".into(),
        "--quiet".into(),
        "--no-ask-password".into(),
        "--expand-environment=no".into(),
    ];
    for p in properties(cfg, slot, uid, gid) {
        a.push(format!("--property={}", p));
    }
    a.push("--".into());
    a.push("/bin/sh".into());
    a.push("-c".into());
    a.push(command(cfg, slot));
    a
}

/// systemctl show's `Key=Value` blocks (one per unit, a blank line between).
pub fn parse_show(text: &str) -> Vec<HashMap<String, String>> {
    let mut out = Vec::new();
    let mut cur = HashMap::new();
    for line in text.lines() {
        if line.is_empty() {
            if !cur.is_empty() {
                out.push(std::mem::take(&mut cur));
            }
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            cur.insert(k.to_string(), v.to_string());
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

/// A unit's state as a Status. With RemainAfterExit, an ended program's unit stays
/// "active (exited)" with its exit code; a failed one is "failed".
pub fn status_of(p: &HashMap<String, String>) -> Status {
    let get = |k: &str| p.get(k).map(|s| s.as_str()).unwrap_or("");
    if get("LoadState") == "not-found" {
        return Status::gone();
    }
    let active = get("ActiveState");
    let sub = get("SubState");
    let running = matches!(
        active,
        "active" | "activating" | "reloading" | "deactivating"
    ) && sub != "exited";
    if running {
        return Status {
            running: true,
            exit: None,
            result: None,
        };
    }
    let status: Option<i32> = get("ExecMainStatus").parse().ok();
    // ExecMainCode: 1 exited, 2 killed, 3 dumped (CLD_*)
    let exit = match get("ExecMainCode") {
        "1" => status,
        "2" | "3" => status.map(|s| 128 + s),
        _ => None,
    };
    let result = p.get("Result").cloned().filter(|r| !r.is_empty());
    Status {
        running: false,
        exit,
        result,
    }
}

/// Whether `/proc/<pid>/cgroup` names the slot's unit.
pub fn cgroup_names_unit(text: &str, unit: &str) -> bool {
    let want = format!("/{}.service", unit);
    text.lines().any(|l| {
        l.rsplit_once(':')
            .is_some_and(|(_, path)| path.ends_with(&want))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Role;

    fn cfg() -> Config {
        let mut c = Config::defaults(Role::Spawner);
        c.finish().unwrap();
        c
    }

    #[test]
    fn every_planned_property_is_there() {
        let a = run_args(&cfg(), "s07", 1007, 1007);
        let has = |p: &str| a.iter().any(|x| x == &format!("--property={}", p));
        for p in [
            "User=quillo-play-s07", "Group=quillo-play-s07", "RootDirectory=/var/lib/quillo-play/root", "BindReadOnlyPaths=/usr",
            "BindReadOnlyPaths=/etc/ld.so.cache", "BindReadOnlyPaths=/etc/localtime", "BindReadOnlyPaths=/var/lib/quillo-play/src/s07:/src",
            "BindReadOnlyPaths=/var/lib/quillo-play/bin/quillo:/opt/quillo", "TemporaryFileSystem=/work:size=32m,mode=0700,uid=1007,gid=1007,noexec,nosuid,nodev",
            "Environment=HOME=/work", "Environment=QUILLO_JIT=0", "StandardOutput=truncate:/var/lib/quillo-play/log/s07.log", "StandardError=inherit",
            "PrivateNetwork=yes", "RestrictAddressFamilies=AF_UNIX", "IPAddressDeny=any", "MemoryMax=192M", "MemorySwapMax=0", "CPUQuota=50%",
            "TasksMax=32", "LimitNOFILE=256", "LimitFSIZE=16M", "LimitCORE=0", "RuntimeMaxSec=660", "OOMScoreAdjust=1000", "Nice=10", "IOWeight=10",
            "CPUWeight=10", "NoNewPrivileges=yes", "CapabilityBoundingSet=", "AmbientCapabilities=", "PrivateUsers=yes",
            // review H3 took PrivateTmp=yes out for these two; M7 and L9 added the five after PrivateDevices
            // the server's probe: path settings did not reach inside RootDirectory; mounts and
            // the device policy do (noexec everywhere it writes, no pty, /usr/local empty)
            "TemporaryFileSystem=/tmp:size=16m,mode=1777,noexec,nosuid,nodev", "TemporaryFileSystem=/var/tmp:size=16m,mode=1777,noexec,nosuid,nodev",
            "PrivateDevices=yes", "TemporaryFileSystem=/dev/shm:size=8m,mode=1777,noexec,nosuid,nodev", "TemporaryFileSystem=/dev/pts:ro",
            "DevicePolicy=strict", "DeviceAllow=/dev/null rw", "DeviceAllow=/dev/zero rw", "DeviceAllow=/dev/full rw",
            "DeviceAllow=/dev/random r", "DeviceAllow=/dev/urandom r", "TemporaryFileSystem=/usr/local:ro", "PrivateIPC=yes", "ProtectProc=invisible", "ProcSubset=pid", "ProtectKernelTunables=yes", "ProtectKernelModules=yes",
            "ProtectKernelLogs=yes", "ProtectControlGroups=yes", "ProtectClock=yes", "ProtectHostname=yes", "RestrictNamespaces=yes",
            "RestrictSUIDSGID=yes", "RestrictRealtime=yes", "LockPersonality=yes", "MemoryDenyWriteExecute=yes", "RemoveIPC=yes", "UMask=0077",
            "KeyringMode=private", "SystemCallArchitectures=native", "SystemCallFilter=@system-service",
            "SystemCallFilter=~@privileged @resources @mount @swap @reboot @raw-io @module @debug @cpu-emulation @obsolete @keyring",
            "SystemCallFilter=~io_uring_setup io_uring_enter io_uring_register", "SystemCallErrorNumber=EPERM",
        ] {
            assert!(has(p), "missing {}", p);
        }
        assert!(
            !a.iter().any(|x| x == "--property=PrivateTmp=yes"),
            "review H3: /tmp is a tmpfs of its own, not a folder on the host's disk"
        );
        assert!(a.contains(&"--unit=quillo-play-s07".to_string()));
        assert!(a.contains(&"--slice=quillo-play.slice".to_string()));
        let cmd = a.last().unwrap();
        assert_eq!(
            cmd,
            "cp -R /src/. /work/ && cd /work && exec /opt/quillo run --watch --listen unix:/work/app.sock --allowed-hosts s07.play.quillolang.org --trust-proxy 127.0.0.1 --max-compute 2s --max-body 1MB main.qwe"
        );
        let i = a.iter().position(|x| x == "--").unwrap();
        assert_eq!(&a[i + 1..i + 3], &["/bin/sh".to_string(), "-c".to_string()]);
    }

    #[test]
    fn nothing_in_the_command_line_could_be_read_by_a_shell() {
        let a = run_args(&cfg(), "s20", 1, 1);
        let cmd = a.last().unwrap();
        assert!(
            !cmd.contains('$')
                && !cmd.contains('`')
                && !cmd.contains('\'')
                && !cmd.contains('"')
                && !cmd.contains('%')
        );
        for x in &a {
            assert!(!x.contains('$') && !x.contains('\n'), "{}", x);
        }
    }

    #[test]
    fn show_and_status() {
        let text = "Id=quillo-play-s01.service\nLoadState=loaded\nActiveState=active\nSubState=running\nResult=success\nExecMainCode=0\nExecMainStatus=0\n\nId=quillo-play-s02.service\nLoadState=loaded\nActiveState=active\nSubState=exited\nResult=success\nExecMainCode=1\nExecMainStatus=0\n\nId=quillo-play-s03.service\nLoadState=loaded\nActiveState=failed\nSubState=failed\nResult=oom-kill\nExecMainCode=2\nExecMainStatus=9\n\nId=quillo-play-s04.service\nLoadState=not-found\nActiveState=inactive\n";
        let s = parse_show(text);
        assert_eq!(s.len(), 4);
        assert_eq!(
            status_of(&s[0]),
            Status {
                running: true,
                exit: None,
                result: None
            }
        );
        assert_eq!(
            status_of(&s[1]),
            Status {
                running: false,
                exit: Some(0),
                result: Some("success".into())
            }
        );
        assert_eq!(
            status_of(&s[2]),
            Status {
                running: false,
                exit: Some(137),
                result: Some("oom-kill".into())
            }
        );
        assert_eq!(status_of(&s[3]), Status::gone());
    }

    #[test]
    fn cgroups() {
        assert!(cgroup_names_unit(
            "0::/quillo.slice/quillo-play.slice/quillo-play-s07.service\n",
            "quillo-play-s07"
        ));
        assert!(!cgroup_names_unit(
            "0::/quillo.slice/quillo-play.slice/quillo-play-s17.service\n",
            "quillo-play-s07"
        ));
        assert!(!cgroup_names_unit(
            "0::/system.slice/quillo-play-s07.service.evil\n",
            "quillo-play-s07"
        ));
        assert!(!cgroup_names_unit("0::/init.scope\n", "quillo-play-s07"));
    }
}
