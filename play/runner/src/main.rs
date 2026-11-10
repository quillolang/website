use quillo_play::backend::Backend;
use quillo_play::config::{Config, Role};
use std::net::TcpListener;
use std::sync::Arc;

const HELP: &str = "quillo-play: the runner behind quillolang.org/play/

usage:
  quillo-play spawner [--config FILE] [--root DIR] [--spawner SOCKET] ...
      root, Linux: makes each run a sandboxed systemd unit; talks only to the proxy
  quillo-play proxy [--config FILE] [--secret-file FILE] [--api ADDR] [--preview ADDR] ...
      user quillo-play: the website's API (with PLAY_SECRET) and the previews' traffic
  quillo-play dev [--quillo PATH] [--port-api 4311] [--port-preview 4310] [--dir DIR]
      both in one process on 127.0.0.1, with NO SANDBOX: for working on the editor

Settings are the flags' names, also as `key = value` lines in /etc/quillo-play/config
(server roles) or --config FILE. See README.md.
";

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let role = match args.get(1).map(|s| s.as_str()) {
        Some("spawner") => Role::Spawner,
        Some("proxy") => Role::Proxy,
        Some("dev") => Role::Dev,
        Some("-h" | "--help" | "help") | None => {
            print!("{}", HELP);
            return;
        }
        Some("version" | "--version") => {
            println!("quillo-play {}", env!("CARGO_PKG_VERSION"));
            return;
        }
        Some(other) => {
            eprintln!("quillo-play: no role {:?}\n\n{}", other, HELP);
            std::process::exit(2);
        }
    };
    let cfg = match Config::load(role, &args[2..]) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("quillo-play: {}", e);
            std::process::exit(2);
        }
    };
    let r = match role {
        Role::Dev => dev(cfg),
        Role::Proxy => proxy(cfg),
        Role::Spawner => spawner(cfg),
    };
    if let Err(e) = r {
        eprintln!("quillo-play: {}", e);
        std::process::exit(1);
    }
}

fn listen(addr: std::net::SocketAddr) -> Result<TcpListener, String> {
    TcpListener::bind(addr).map_err(|e| format!("cannot listen on {}: {}", addr, e))
}

fn park() -> ! {
    loop {
        std::thread::park();
    }
}

fn dev(cfg: Config) -> Result<(), String> {
    let backend = Arc::new(
        quillo_play::dev::DevBackend::new(&cfg)
            .map_err(|e| format!("cannot make {}: {}", cfg.dir.display(), e))?,
    );
    let b = backend.clone();
    quillo_play::util::on_signal(move || b.stop_all());
    let api = listen(cfg.api)?;
    let preview = listen(cfg.preview)?;
    eprintln!("quillo-play dev: NO SANDBOX. Programs run as you, with your files and network. Never expose these ports.");
    eprintln!(
        "  API      http://{}  (Authorization: Bearer {})",
        cfg.api,
        if cfg.secret == quillo_play::config::DEV_SECRET {
            cfg.secret.as_str()
        } else {
            "$PLAY_SECRET"
        }
    );
    eprintln!(
        "  previews {}  ({} slots, runs in {})",
        cfg.origin("sNN"),
        cfg.slots.len(),
        cfg.dir.display()
    );
    eprintln!("  open the editor at a host under {} (such as http://{}:8080/play/) so previews are the same site", cfg.host_suffix, cfg.host_suffix);
    let p = quillo_play::proxy::Proxy::new(cfg, backend);
    p.start(api, preview);
    park()
}

fn proxy(cfg: Config) -> Result<(), String> {
    let backend = Arc::new(quillo_play::client::SpawnerClient {
        socket: cfg.spawner.clone(),
    });
    let api = listen(cfg.api)?;
    let preview = listen(cfg.preview)?;
    eprintln!(
        "quillo-play proxy: API on {}, previews on {} ({}), spawner at {}",
        cfg.api,
        cfg.preview,
        cfg.origin("sNN"),
        cfg.spawner.display()
    );
    let p = quillo_play::proxy::Proxy::new(cfg, backend);
    // stopped (not restarted), it starts no more runs and stops its programs, rather than
    // leave them up to 11 minutes (review L6, second review item 8); before any thread is
    // made, so the signal is this thread's
    let ps = p.clone();
    quillo_play::util::on_signal(move || ps.shut_down());
    p.stop_every_slot();
    p.start(api, preview);
    park()
}

#[cfg(target_os = "linux")]
fn spawner(cfg: Config) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    if unsafe { libc::geteuid() } != 0 {
        return Err("the spawner runs as root (it starts systemd units)".into());
    }
    let backend = Arc::new(quillo_play::systemd::SystemdBackend::new(&cfg)?);
    backend.stop_all();
    let (proxy_uid, proxy_gid) = quillo_play::util::user_ids(&cfg.proxy_user).ok_or_else(|| {
        format!(
            "there is no user {} (run play/deploy/setup.sh)",
            cfg.proxy_user
        )
    })?;
    let dir = cfg
        .spawner
        .parent()
        .ok_or("the spawner socket needs a folder")?
        .to_path_buf();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::os::unix::fs::chown(&dir, Some(0), Some(proxy_gid)).map_err(|e| e.to_string())?;
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o750))
        .map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&cfg.spawner);
    let l = std::os::unix::net::UnixListener::bind(&cfg.spawner)
        .map_err(|e| format!("cannot listen on {}: {}", cfg.spawner.display(), e))?;
    std::os::unix::fs::chown(&cfg.spawner, Some(0), Some(proxy_gid)).map_err(|e| e.to_string())?;
    std::fs::set_permissions(&cfg.spawner, std::fs::Permissions::from_mode(0o660))
        .map_err(|e| e.to_string())?;
    let b = backend.clone();
    quillo_play::util::on_signal(move || b.stop_all());
    eprintln!(
        "quillo-play spawner: {} slots, {} on {}",
        cfg.slots.len(),
        cfg.root.display(),
        cfg.spawner.display()
    );
    quillo_play::spawner::serve(l, backend, cfg.slots.clone(), vec![0, proxy_uid]);
    Ok(())
}

#[cfg(not(target_os = "linux"))]
fn spawner(_cfg: Config) -> Result<(), String> {
    Err("the spawner runs on Linux, with systemd; here, use `quillo-play dev`".into())
}
