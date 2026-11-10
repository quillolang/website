//! Settings: defaults for each role, then `key = value` lines of a config file
//! (/etc/quillo-play/config for the server roles when it is there, or `--config FILE`),
//! then `--key value` (or `--key=value`) flags. Keys are the flags' names.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::Duration;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    Spawner,
    Proxy,
    Dev,
}

#[derive(Clone, Debug)]
pub struct Config {
    pub role: Role,
    /// s01, s02, ...: the preview hosts' first labels and the sandboxes' names.
    pub slots: Vec<String>,
    /// The system user of slot sNN is this followed by sNN.
    pub slot_user_prefix: String,
    /// sNN.<host_suffix> is slot sNN's preview host.
    pub host_suffix: String,
    pub scheme: String,
    /// A port to put in preview addresses (dev: the preview port; on the server, none).
    pub public_port: Option<u16>,
    /// The session cookie on a preview host.
    pub cookie: String,
    pub cookie_secure: bool,
    /// The editor's address, for the pages a preview shows when it has ended.
    pub ide_url: String,
    /// The one origin that may show a preview in a frame: the editor's (from ide-url
    /// unless set).
    pub frame_ancestors: String,
    /// The website's API.
    pub api: SocketAddr,
    /// The previews' traffic, from Limer.
    pub preview: SocketAddr,
    /// The spawner's socket.
    pub spawner: PathBuf,
    /// src/, log/, root/ and bin/quillo live here.
    pub root: PathBuf,
    /// The user the proxy runs as: the only one, with root, the spawner talks to.
    pub proxy_user: String,
    pub systemd_run: PathBuf,
    pub systemctl: PathBuf,
    /// The bearer secret of the API (PLAY_SECRET, or the file `secret-file` names).
    pub secret: String,
    pub max_runtime: Duration,
    pub idle: Duration,
    pub runs_per_hour: usize,
    pub ready_wait: Duration,
    /// How much of a run's output is kept, and how much one /log answer gives.
    pub log_keep: usize,
    pub log_answer: usize,
    /// dev: the quillo to run, and where the runs' folders go.
    pub quillo: PathBuf,
    pub dir: PathBuf,
    /// dev: X-Forwarded-For is the TCP peer (there is no Limer in front); on the
    /// server, Limer's X-Forwarded-For is passed on as it is.
    pub xff_from_peer: bool,
    pub memory_max: String,
    pub cpu_quota: String,
    pub work_size: String,
    pub max_compute: String,
    pub max_body: String,
    /// Preview connections at once, in all and for one slot; more get 503 (review H2).
    pub max_preview_conns: usize,
    pub max_slot_conns: usize,
    /// API connections at once.
    pub max_api_conns: usize,
    /// How long a preview's program may say nothing (a request's answer), and how long an
    /// upgraded connection (a WebSocket) may carry nothing either way (review H2).
    pub upstream_idle: Duration,
    pub ws_idle: Duration,
    /// How long the link /run gives (its enter token) may be used, once (review L4).
    pub enter_ttl: Duration,
    /// Ended sessions' output kept for /log, all together (review M4).
    pub ended_budget: usize,
}

pub const DEFAULT_FILE: &str = "/etc/quillo-play/config";
pub const DEV_SECRET: &str = "quillo-play-dev-secret";

pub fn slot_names(n: usize) -> Vec<String> {
    (1..=n).map(|i| format!("s{:02}", i)).collect()
}

impl Config {
    pub fn defaults(role: Role) -> Config {
        let dev = role == Role::Dev;
        Config {
            role,
            slots: slot_names(20),
            slot_user_prefix: "quillo-play-".into(),
            host_suffix: if dev {
                "play.localhost".into()
            } else {
                "play.quillolang.org".into()
            },
            scheme: if dev { "http".into() } else { "https".into() },
            public_port: None,
            cookie: if dev {
                "play".into()
            } else {
                "__Host-play".into()
            },
            cookie_secure: !dev,
            ide_url: if dev {
                "http://play.localhost:8080/play/".into()
            } else {
                "https://quillolang.org/play/".into()
            },
            frame_ancestors: String::new(),
            api: "127.0.0.1:4311".parse().unwrap(),
            preview: "127.0.0.1:4310".parse().unwrap(),
            spawner: "/run/quillo-play/spawner.sock".into(),
            root: "/var/lib/quillo-play".into(),
            proxy_user: "quillo-play".into(),
            systemd_run: "/usr/bin/systemd-run".into(),
            systemctl: "/usr/bin/systemctl".into(),
            secret: String::new(),
            max_runtime: Duration::from_secs(600),
            idle: Duration::from_secs(180),
            runs_per_hour: 30,
            ready_wait: Duration::from_secs(8),
            log_keep: 256 * 1024,
            log_answer: 64 * 1024,
            quillo: "quillo".into(),
            dir: format!("/tmp/quillo-play-{}", std::process::id()).into(),
            xff_from_peer: dev,
            memory_max: "192M".into(),
            cpu_quota: "50%".into(),
            work_size: "32m".into(),
            max_compute: "2s".into(),
            max_body: "1MB".into(),
            max_preview_conns: 512,
            max_slot_conns: 48,
            max_api_conns: 128,
            upstream_idle: Duration::from_secs(120),
            ws_idle: Duration::from_secs(600),
            enter_ttl: Duration::from_secs(60),
            ended_budget: 16 * 1024 * 1024,
        }
    }

    /// The settings of a role from its command line (after the role's name).
    pub fn load(role: Role, args: &[String]) -> Result<Config, String> {
        let mut c = Config::defaults(role);
        let pairs = flag_pairs(args)?;
        let mut file: Option<PathBuf> = None;
        if role != Role::Dev && std::path::Path::new(DEFAULT_FILE).exists() {
            file = Some(DEFAULT_FILE.into());
        }
        for (k, v) in &pairs {
            if k == "config" {
                file = Some(v.into());
            }
        }
        if let Some(f) = &file {
            let text = std::fs::read_to_string(f)
                .map_err(|e| format!("cannot read {}: {}", f.display(), e))?;
            for (i, line) in text.lines().enumerate() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                let (k, v) = line
                    .split_once('=')
                    .ok_or_else(|| format!("{}:{}: a line is key = value", f.display(), i + 1))?;
                c.set(k.trim(), v.trim())
                    .map_err(|e| format!("{}:{}: {}", f.display(), i + 1, e))?;
            }
        }
        let mut secret_file: Option<String> = None;
        for (k, v) in &pairs {
            match k.as_str() {
                "config" => {}
                "secret-file" => secret_file = Some(v.clone()),
                _ => c.set(k, v)?,
            }
        }
        if role != Role::Spawner {
            if let Some(f) = secret_file {
                c.secret = std::fs::read_to_string(&f)
                    .map_err(|e| format!("cannot read the secret file {}: {}", f, e))?
                    .trim()
                    .to_string();
            } else if let Ok(s) = std::env::var("PLAY_SECRET") {
                c.secret = s.trim().to_string();
            }
            if c.secret.is_empty() && role == Role::Dev {
                c.secret = DEV_SECRET.into();
            }
        }
        c.finish()?;
        Ok(c)
    }

    pub fn set(&mut self, key: &str, v: &str) -> Result<(), String> {
        let num = |v: &str| {
            v.parse::<u64>()
                .map_err(|_| format!("`{}` takes a number, got {:?}", key, v))
        };
        match key {
            "slots" => {
                let n = num(v)? as usize;
                if !(1..=99).contains(&n) {
                    return Err("`slots` is 1 to 99".into());
                }
                self.slots = slot_names(n);
            }
            "slot-user-prefix" => self.slot_user_prefix = v.into(),
            "host-suffix" => self.host_suffix = v.to_ascii_lowercase(),
            "scheme" => self.scheme = v.into(),
            "public-port" => self.public_port = Some(num(v)? as u16),
            "cookie" => self.cookie = v.into(),
            "cookie-secure" => self.cookie_secure = matches!(v, "1" | "yes" | "true"),
            "ide-url" => self.ide_url = v.into(),
            "frame-ancestors" => self.frame_ancestors = v.into(),
            "api" => {
                self.api = v.parse().map_err(|_| {
                    format!("`api` is an address such as 127.0.0.1:4311, got {:?}", v)
                })?
            }
            "preview" => {
                self.preview = v.parse().map_err(|_| {
                    format!(
                        "`preview` is an address such as 127.0.0.1:4310, got {:?}",
                        v
                    )
                })?
            }
            "port-api" => self.api = SocketAddr::from(([127, 0, 0, 1], num(v)? as u16)),
            "port-preview" => self.preview = SocketAddr::from(([127, 0, 0, 1], num(v)? as u16)),
            "spawner" => self.spawner = v.into(),
            "root" => self.root = v.into(),
            "proxy-user" => self.proxy_user = v.into(),
            "systemd-run" => self.systemd_run = v.into(),
            "systemctl" => self.systemctl = v.into(),
            "max-runtime" => self.max_runtime = Duration::from_secs(num(v)?),
            "idle" => self.idle = Duration::from_secs(num(v)?),
            "runs-per-hour" => self.runs_per_hour = num(v)? as usize,
            "ready-wait" => self.ready_wait = Duration::from_secs(num(v)?),
            "quillo" => self.quillo = v.into(),
            "dir" => self.dir = v.into(),
            "xff-from-peer" => self.xff_from_peer = matches!(v, "1" | "yes" | "true"),
            "memory-max" => self.memory_max = v.into(),
            "cpu-quota" => self.cpu_quota = v.into(),
            "work-size" => self.work_size = v.into(),
            "max-compute" => self.max_compute = v.into(),
            "max-body" => self.max_body = v.into(),
            "max-preview-conns" => self.max_preview_conns = num(v)? as usize,
            "max-slot-conns" => self.max_slot_conns = num(v)? as usize,
            "max-api-conns" => self.max_api_conns = num(v)? as usize,
            "upstream-idle" => self.upstream_idle = Duration::from_secs(num(v)?),
            "ws-idle" => self.ws_idle = Duration::from_secs(num(v)?),
            "enter-ttl" => self.enter_ttl = Duration::from_secs(num(v)?),
            "ended-budget" => self.ended_budget = num(v)? as usize,
            _ => return Err(format!("no setting `{}`", key)),
        }
        Ok(())
    }

    /// Checks what goes into a command line or a header, and fills what follows from the rest.
    pub fn finish(&mut self) -> Result<(), String> {
        let label = |s: &str| {
            !s.is_empty()
                && s.bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        };
        if self.host_suffix.is_empty() || !self.host_suffix.split('.').all(label) {
            return Err(format!(
                "`host-suffix` is a host name such as play.quillolang.org, got {:?}",
                self.host_suffix
            ));
        }
        if !matches!(self.scheme.as_str(), "http" | "https") {
            return Err("`scheme` is http or https".into());
        }
        let tchar = |b: u8| b.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&b);
        if self.cookie.is_empty() || !self.cookie.bytes().all(tchar) {
            return Err(format!("`cookie` is a cookie name, got {:?}", self.cookie));
        }
        if self.cookie.starts_with("__Host-") && !(self.cookie_secure && self.scheme == "https") {
            return Err("a __Host- cookie needs https and cookie-secure".into());
        }
        if self.slot_user_prefix.is_empty()
            || !self
                .slot_user_prefix
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_')
        {
            return Err("`slot-user-prefix` is lowercase letters, digits, - and _".into());
        }
        let safe_path = |p: &PathBuf| {
            let s = p.to_string_lossy();
            s.starts_with('/')
                && s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"/_.-".contains(&b))
                && !s.split('/').any(|seg| seg == "..")
        };
        if self.role == Role::Spawner && !safe_path(&self.root) {
            return Err(format!(
                "`root` is an absolute path of letters, digits, / _ . -, got {:?}",
                self.root
            ));
        }
        let size = |s: &str, units: &[&str]| {
            let d = s.trim_end_matches(|c: char| c.is_ascii_alphabetic() || c == '%');
            !d.is_empty() && d.bytes().all(|b| b.is_ascii_digit()) && units.contains(&&s[d.len()..])
        };
        if !size(&self.memory_max, &["K", "M", "G"]) {
            return Err("`memory-max` is a size such as 192M".into());
        }
        if !size(&self.cpu_quota, &["%"]) {
            return Err("`cpu-quota` is a share such as 50%".into());
        }
        if !size(&self.work_size, &["k", "m", "g"]) {
            return Err("`work-size` is a tmpfs size such as 32m".into());
        }
        if !size(&self.max_compute, &["ms", "s", "m"]) {
            return Err("`max-compute` is a time such as 2s".into());
        }
        if !size(&self.max_body, &["KB", "MB", "GB"]) {
            return Err("`max-body` is a size such as 1MB".into());
        }
        if self.role != Role::Spawner && self.secret.len() < 16 {
            return Err(
                "the API's secret (PLAY_SECRET, or --secret-file) is at least 16 characters".into(),
            );
        }
        if self.role == Role::Dev {
            let lo = std::net::IpAddr::from([127, 0, 0, 1]);
            if self.api.ip() != lo || self.preview.ip() != lo {
                return Err("dev mode has no sandbox, so it listens on 127.0.0.1 only".into());
            }
            if self.public_port.is_none() {
                self.public_port = Some(self.preview.port());
            }
        }
        if self.frame_ancestors.is_empty() {
            self.frame_ancestors = origin_of(&self.ide_url).ok_or_else(|| {
                format!("`ide-url` is an http(s) address, got {:?}", self.ide_url)
            })?;
        }
        if origin_of(&self.frame_ancestors).as_deref() != Some(self.frame_ancestors.as_str()) {
            return Err(format!(
                "`frame-ancestors` is one origin such as https://quillolang.org, got {:?}",
                self.frame_ancestors
            ));
        }
        if self.runs_per_hour == 0 || self.max_runtime.is_zero() || self.idle.is_zero() {
            return Err("`runs-per-hour`, `max-runtime` and `idle` are more than 0".into());
        }
        if self.max_preview_conns == 0
            || self.max_slot_conns == 0
            || self.max_api_conns == 0
            || self.upstream_idle.is_zero()
            || self.ws_idle.is_zero()
            || self.enter_ttl.is_zero()
        {
            return Err("the connection caps, `upstream-idle`, `ws-idle` and `enter-ttl` are more than 0".into());
        }
        Ok(())
    }

    /// `http://s07.play.localhost:4310`, `https://s07.play.quillolang.org`.
    pub fn origin(&self, slot: &str) -> String {
        match self.public_port {
            Some(p) => format!("{}://{}.{}:{}", self.scheme, slot, self.host_suffix, p),
            None => format!("{}://{}.{}", self.scheme, slot, self.host_suffix),
        }
    }

    pub fn host(&self, slot: &str) -> String {
        format!("{}.{}", slot, self.host_suffix)
    }

    pub fn slot_user(&self, slot: &str) -> String {
        format!("{}{}", self.slot_user_prefix, slot)
    }
}

/// `https://quillolang.org` of `https://quillolang.org/play/`: scheme, host, port.
pub fn origin_of(url: &str) -> Option<String> {
    let (scheme, rest) = url.split_once("://")?;
    if scheme != "http" && scheme != "https" {
        return None;
    }
    let host = rest.split('/').next()?;
    let (name, port) = match host.rsplit_once(':') {
        Some((n, p)) => (n, Some(p)),
        None => (host, None),
    };
    let label = |s: &str| {
        !s.is_empty()
            && s.bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
    };
    if !name.split('.').all(label)
        || port.is_some_and(|p| p.is_empty() || !p.bytes().all(|b| b.is_ascii_digit()))
    {
        return None;
    }
    Some(format!("{}://{}", scheme, host))
}

/// `--key value` and `--key=value` pairs.
pub fn flag_pairs(args: &[String]) -> Result<Vec<(String, String)>, String> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < args.len() {
        let a = &args[i];
        let Some(k) = a.strip_prefix("--") else {
            return Err(format!("expected --setting, got {:?}", a));
        };
        if let Some((k, v)) = k.split_once('=') {
            out.push((k.to_string(), v.to_string()));
            i += 1;
        } else {
            let v = args
                .get(i + 1)
                .ok_or_else(|| format!("--{} needs a value", k))?;
            out.push((k.to_string(), v.clone()));
            i += 2;
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(a: &[&str]) -> Vec<String> {
        a.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn dev_defaults_and_flags() {
        let c = Config::load(
            Role::Dev,
            &args(&["--port-api", "5001", "--port-preview=5002", "--slots", "3"]),
        )
        .unwrap();
        assert_eq!(c.api.port(), 5001);
        assert_eq!(c.preview.port(), 5002);
        assert_eq!(c.public_port, Some(5002));
        assert_eq!(c.slots, vec!["s01", "s02", "s03"]);
        assert_eq!(c.cookie, "play");
        assert!(!c.cookie_secure);
        assert!(c.xff_from_peer);
        assert_eq!(c.origin("s02"), "http://s02.play.localhost:5002");
        assert!(c.secret.len() >= 16);
    }

    #[test]
    fn dev_listens_on_loopback_only() {
        let e = Config::load(Role::Dev, &args(&["--api", "0.0.0.0:4311"])).unwrap_err();
        assert!(e.contains("127.0.0.1"), "{}", e);
    }

    #[test]
    fn server_defaults() {
        let mut c = Config::defaults(Role::Proxy);
        c.secret = "0123456789abcdef0123".into();
        c.finish().unwrap();
        assert_eq!(c.origin("s07"), "https://s07.play.quillolang.org");
        assert_eq!(c.cookie, "__Host-play");
        assert!(!c.xff_from_peer);
        assert_eq!(c.slot_user("s07"), "quillo-play-s07");
        assert_eq!(c.slots.len(), 20);
    }

    #[test]
    fn bad_settings_are_refused() {
        let mut c = Config::defaults(Role::Proxy);
        c.secret = "short".into();
        assert!(c.finish().unwrap_err().contains("secret"));
        for (k, v) in [
            ("host-suffix", "play.quillolang.org;rm"),
            ("host-suffix", "a..b"),
            ("scheme", "ftp"),
            ("cookie", "a b"),
            ("memory-max", "192"),
            ("cpu-quota", "50"),
            ("max-body", "1m"),
            ("max-compute", "2"),
            ("slots", "100"),
            ("slots", "0"),
        ] {
            let mut c = Config::defaults(Role::Proxy);
            c.secret = "0123456789abcdef0123".into();
            let r = c.set(k, v).and_then(|_| c.finish());
            assert!(r.is_err(), "{} = {} was taken", k, v);
        }
        let mut c = Config::defaults(Role::Spawner);
        c.set("root", "/var/lib/quillo play").unwrap();
        assert!(c.finish().is_err());
        let mut c = Config::defaults(Role::Spawner);
        c.set("root", "/var/lib/../etc").unwrap();
        assert!(c.finish().is_err());
        assert!(Config::defaults(Role::Dev).set("nope", "1").is_err());
        // a __Host- cookie over http
        let mut c = Config::defaults(Role::Dev);
        c.secret = DEV_SECRET.into();
        c.cookie = "__Host-play".into();
        assert!(c.finish().is_err());
    }

    #[test]
    fn the_frame_origin_comes_from_the_editors_address() {
        let mut c = Config::defaults(Role::Proxy);
        c.secret = "0123456789abcdef0123".into();
        c.finish().unwrap();
        assert_eq!(c.frame_ancestors, "https://quillolang.org");
        let mut d = Config::defaults(Role::Dev);
        d.secret = DEV_SECRET.into();
        d.finish().unwrap();
        assert_eq!(d.frame_ancestors, "http://play.localhost:8080");
        assert_eq!(
            origin_of("https://a.b:8443/x/y?z"),
            Some("https://a.b:8443".into())
        );
        for bad in [
            "ftp://a.b/",
            "https://",
            "https://a b/",
            "https://a.b:x/",
            "https://a.b;evil/",
            "quillolang.org/play/",
        ] {
            assert_eq!(origin_of(bad), None, "{}", bad);
        }
        let mut c = Config::defaults(Role::Proxy);
        c.secret = "0123456789abcdef0123".into();
        c.frame_ancestors = "https://a.b https://c.d".into();
        assert!(c.finish().is_err());
    }

    #[test]
    fn flag_pairs_parse() {
        assert_eq!(
            flag_pairs(&args(&["--a", "1", "--b=2"])).unwrap(),
            vec![("a".to_string(), "1".to_string()), ("b".into(), "2".into())]
        );
        assert!(flag_pairs(&args(&["--a"])).is_err());
        assert!(flag_pairs(&args(&["a"])).is_err());
    }

    #[test]
    fn config_file_is_read() {
        let d = std::env::temp_dir().join(format!("qp-cfg-{}", std::process::id()));
        std::fs::write(
            &d,
            "# a comment\nslots = 4\nhost-suffix = play.example.org\n\n",
        )
        .unwrap();
        let c = Config::load(Role::Dev, &args(&["--config", d.to_str().unwrap()])).unwrap();
        assert_eq!(c.slots.len(), 4);
        assert_eq!(c.host_suffix, "play.example.org");
        std::fs::write(&d, "slots\n").unwrap();
        assert!(Config::load(Role::Dev, &args(&["--config", d.to_str().unwrap()])).is_err());
        std::fs::remove_file(&d).unwrap();
    }
}
