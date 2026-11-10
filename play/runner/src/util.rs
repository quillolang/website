//! Small things several parts use.

use std::io::{self, Read};

/// Whether two byte strings are equal, taking the same time wherever they differ
/// (the length is not secret: tokens are always 32 characters).
pub fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut d = 0u8;
    for i in 0..a.len() {
        d |= a[i] ^ b[i];
    }
    d == 0
}

/// A new session token: 16 random bytes as 32 lowercase hex characters.
pub fn new_token() -> io::Result<String> {
    let mut b = [0u8; 16];
    std::fs::File::open("/dev/urandom")?.read_exact(&mut b)?;
    Ok(b.iter().map(|x| format!("{:02x}", x)).collect())
}

/// Whether `s` looks like a token we make (so a long or odd one is refused before comparing).
pub fn is_token(s: &str) -> bool {
    s.len() == 32 && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

pub fn html_escape(s: &str) -> String {
    let mut o = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => o.push_str("&amp;"),
            '<' => o.push_str("&lt;"),
            '>' => o.push_str("&gt;"),
            '"' => o.push_str("&quot;"),
            '\'' => o.push_str("&#39;"),
            c => o.push(c),
        }
    }
    o
}

/// How much of `d` to take so it does not end inside a UTF-8 character: the length of
/// `d`, or up to 3 less when its last character is not complete yet.
pub fn utf8_cut(d: &[u8]) -> usize {
    let n = d.len();
    for back in 1..=n.min(3) {
        let b = d[n - back];
        if b & 0xC0 == 0x80 {
            continue;
        }
        let need = if b < 0x80 {
            1
        } else if b >> 5 == 0b110 {
            2
        } else if b >> 4 == 0b1110 {
            3
        } else if b >> 3 == 0b11110 {
            4
        } else {
            1
        };
        return if back < need { n - back } else { n };
    }
    n
}

/// The uid and gid of a user, by name.
pub fn user_ids(name: &str) -> Option<(u32, u32)> {
    let c = std::ffi::CString::new(name).ok()?;
    let mut pw: libc::passwd = unsafe { std::mem::zeroed() };
    let mut buf = vec![0 as libc::c_char; 16384];
    let mut out: *mut libc::passwd = std::ptr::null_mut();
    let r = unsafe { libc::getpwnam_r(c.as_ptr(), &mut pw, buf.as_mut_ptr(), buf.len(), &mut out) };
    if r != 0 || out.is_null() {
        return None;
    }
    Some((pw.pw_uid, pw.pw_gid))
}

/// The uid of the process at the other end of a Unix socket.
pub fn peer_uid(s: &std::os::unix::net::UnixStream) -> io::Result<u32> {
    use std::os::unix::io::AsRawFd;
    #[cfg(target_os = "linux")]
    {
        let c = peer_cred(s.as_raw_fd())?;
        Ok(c.uid)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let mut uid: libc::uid_t = 0;
        let mut gid: libc::gid_t = 0;
        if unsafe { libc::getpeereid(s.as_raw_fd(), &mut uid, &mut gid) } != 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(uid)
    }
}

#[cfg(target_os = "linux")]
pub fn peer_cred(fd: std::os::unix::io::RawFd) -> io::Result<libc::ucred> {
    let mut c: libc::ucred = unsafe { std::mem::zeroed() };
    let mut len = std::mem::size_of::<libc::ucred>() as libc::socklen_t;
    let r = unsafe {
        libc::getsockopt(
            fd,
            libc::SOL_SOCKET,
            libc::SO_PEERCRED,
            &mut c as *mut _ as *mut libc::c_void,
            &mut len,
        )
    };
    if r != 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(c)
}

/// Blocks SIGINT, SIGTERM and SIGHUP in this thread (and so in every thread made after),
/// and runs `on_signal` on a thread of its own when one comes; then the process exits.
/// Children made with std::process::Command start with no signal blocked.
pub fn on_signal<F: FnOnce() + Send + 'static>(on_signal: F) {
    unsafe {
        let mut set: libc::sigset_t = std::mem::zeroed();
        libc::sigemptyset(&mut set);
        libc::sigaddset(&mut set, libc::SIGINT);
        libc::sigaddset(&mut set, libc::SIGTERM);
        libc::sigaddset(&mut set, libc::SIGHUP);
        libc::pthread_sigmask(libc::SIG_BLOCK, &set, std::ptr::null_mut());
        let set_copy = set;
        std::thread::spawn(move || {
            let mut sig: libc::c_int = 0;
            libc::sigwait(&set_copy, &mut sig);
            eprintln!("quillo-play: signal {}, stopping", sig);
            on_signal();
            std::process::exit(0);
        });
    }
}

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Standard base64 with padding: the spawner's output bytes go to the proxy whole, not
/// through from_utf8_lossy (review L7).
pub fn b64_encode(d: &[u8]) -> String {
    let mut o = String::with_capacity(d.len().div_ceil(3) * 4);
    for c in d.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        o.push(B64[(n >> 18) as usize & 63] as char);
        o.push(B64[(n >> 12) as usize & 63] as char);
        o.push(if c.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
        o.push(if c.len() > 2 { B64[n as usize & 63] as char } else { '=' });
    }
    o
}

pub fn b64_decode(s: &str) -> Option<Vec<u8>> {
    let b = s.as_bytes();
    if !b.len().is_multiple_of(4) {
        return None;
    }
    let val = |c: u8| -> Option<u32> {
        Some(match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return None,
        } as u32)
    };
    let mut o = Vec::with_capacity(b.len() / 4 * 3);
    for (i, q) in b.chunks(4).enumerate() {
        let last = i == b.len() / 4 - 1;
        let pad = q.iter().rev().take_while(|&&c| c == b'=').count();
        if pad > 2 || (pad > 0 && !last) {
            return None;
        }
        let mut n = 0u32;
        for (j, &c) in q.iter().enumerate() {
            let v = if j >= 4 - pad { 0 } else { val(c)? };
            n = n << 6 | v;
        }
        o.push((n >> 16) as u8);
        if pad < 2 {
            o.push((n >> 8) as u8);
        }
        if pad < 1 {
            o.push(n as u8);
        }
    }
    Some(o)
}

/// Remembers, for each key, that something just failed, so it is not tried again for a
/// while (review M5: a preview request whose program has no socket yet does not run
/// `systemctl show` against PID 1 each time). Time is passed in, for the tests.
pub struct FailMemo {
    hold: std::time::Duration,
    at: std::sync::Mutex<std::collections::HashMap<String, std::time::Instant>>,
}

impl FailMemo {
    pub fn new(hold: std::time::Duration) -> FailMemo {
        FailMemo {
            hold,
            at: std::sync::Mutex::new(std::collections::HashMap::new()),
        }
    }
    /// Whether `key` failed less than `hold` before `now`.
    pub fn recent(&self, key: &str, now: std::time::Instant) -> bool {
        self.at
            .lock()
            .unwrap()
            .get(key)
            .is_some_and(|t| now.saturating_duration_since(*t) < self.hold)
    }
    pub fn failed(&self, key: &str, now: std::time::Instant) {
        self.at.lock().unwrap().insert(key.to_string(), now);
    }
    pub fn clear(&self, key: &str) {
        self.at.lock().unwrap().remove(key);
    }
}

/// The two keys a run is counted by (second review, item 4):
/// - the client: whose session it is, one at a time: the exact address (`ip:2001:db8::1`,
///   written canonically, so two spellings of one address are one client), `ip:1.2.3.4`, or
///   an account (`u12`);
/// - the network: what the hourly limit and the cap on sessions at once count: an IPv6
///   address's /64 (`ip6:2001:db8:1:2::/64`), since one visitor has a whole /64 to choose
///   from, while a whole office or school behind one /64 still gets a session each; an IPv4
///   address is its own network, and so is an account.
///
/// An IPv4-mapped IPv6 address is its IPv4 address; anything that is no address is both keys.
pub fn client_keys(client: &str) -> (String, String) {
    let Some(a) = client.strip_prefix("ip:") else {
        return (client.to_string(), client.to_string());
    };
    let a = a.trim().trim_start_matches('[').trim_end_matches(']');
    if let Ok(v6) = a.parse::<std::net::Ipv6Addr>() {
        if let Some(v4) = v6.to_ipv4_mapped() {
            let k = format!("ip:{}", v4);
            return (k.clone(), k);
        }
        let s = v6.segments();
        return (
            format!("ip:{}", v6),
            format!("ip6:{:x}:{:x}:{:x}:{:x}::/64", s[0], s[1], s[2], s[3]),
        );
    }
    if let Ok(v4) = a.parse::<std::net::Ipv4Addr>() {
        let k = format!("ip:{}", v4);
        return (k.clone(), k);
    }
    (client.to_string(), client.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ct_eq_compares() {
        assert!(ct_eq(b"abc", b"abc"));
        assert!(!ct_eq(b"abc", b"abd"));
        assert!(!ct_eq(b"abc", b"ab"));
        assert!(!ct_eq(b"", b"a"));
        assert!(ct_eq(b"", b""));
    }

    #[test]
    fn tokens_are_32_hex_and_differ() {
        let a = new_token().unwrap();
        let b = new_token().unwrap();
        assert!(is_token(&a) && is_token(&b));
        assert_ne!(a, b);
        assert!(!is_token("ABCDEF0123456789abcdef0123456789"));
        assert!(!is_token("abc"));
        assert!(!is_token(&format!("{}0", a)));
    }

    #[test]
    fn utf8_cut_stops_before_a_partial_character() {
        assert_eq!(utf8_cut(b"abc"), 3);
        assert_eq!(utf8_cut(b""), 0);
        let e = "é".as_bytes(); // 2 bytes
        assert_eq!(utf8_cut(&e[..1]), 0);
        assert_eq!(utf8_cut(e), 2);
        let s = "a€".as_bytes(); // 1 + 3
        assert_eq!(utf8_cut(&s[..2]), 1);
        assert_eq!(utf8_cut(&s[..3]), 1);
        assert_eq!(utf8_cut(s), 4);
        let f = "😀".as_bytes(); // 4
        assert_eq!(utf8_cut(&f[..3]), 0);
        assert_eq!(utf8_cut(f), 4);
        // not UTF-8 at all: taken as it is
        assert_eq!(utf8_cut(&[0x80, 0x80, 0x80, 0x80]), 4);
    }

    #[test]
    fn html_escape_escapes() {
        assert_eq!(
            html_escape("<a href=\"x\">'&'</a>"),
            "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;"
        );
    }

    #[test]
    fn base64_round_trips_any_bytes() {
        assert_eq!(b64_encode(b""), "");
        assert_eq!(b64_encode(b"f"), "Zg==");
        assert_eq!(b64_encode(b"fo"), "Zm8=");
        assert_eq!(b64_encode(b"foo"), "Zm9v");
        assert_eq!(b64_encode(b"foobar"), "Zm9vYmFy");
        for n in 0..300usize {
            let d: Vec<u8> = (0..n).map(|i| (i * 37 + 11) as u8).collect();
            assert_eq!(b64_decode(&b64_encode(&d)).unwrap(), d, "{}", n);
        }
        // bytes that are not UTF-8 stay as they are
        assert_eq!(b64_decode(&b64_encode(&[0xff, 0xfe, 0x80])).unwrap(), vec![0xff, 0xfe, 0x80]);
        for bad in ["Zg=", "Z===", "Zg==Zg==", "Zm9v!", "Zm=v"] {
            assert!(b64_decode(bad).is_none(), "{}", bad);
        }
    }

    #[test]
    fn a_failure_is_remembered_for_a_while() {
        let m = FailMemo::new(std::time::Duration::from_millis(250));
        let t = std::time::Instant::now();
        assert!(!m.recent("s01", t));
        m.failed("s01", t);
        assert!(m.recent("s01", t + std::time::Duration::from_millis(249)));
        assert!(!m.recent("s01", t + std::time::Duration::from_millis(250)));
        assert!(!m.recent("s02", t), "per key");
        m.failed("s01", t);
        m.clear("s01");
        assert!(!m.recent("s01", t));
        // a time before the failure (clocks of two threads) is not a panic
        m.failed("s03", t + std::time::Duration::from_secs(1));
        assert!(m.recent("s03", t));
    }

    #[test]
    fn clients_by_address_and_networks_by_ipv6_64() {
        // second review, item 4: the session is the exact address; the /64 is the network
        let k = |c: &str| client_keys(c);
        assert_eq!(k("u12"), ("u12".into(), "u12".into()));
        assert_eq!(k("ip:1.2.3.4"), ("ip:1.2.3.4".into(), "ip:1.2.3.4".into()));
        assert_eq!(
            k("ip:2001:db8:1:2:3:4:5:6"),
            ("ip:2001:db8:1:2:3:4:5:6".into(), "ip6:2001:db8:1:2::/64".into())
        );
        // one address however it is written; another address of the /64 is another client of
        // the same network
        assert_eq!(k("ip:2001:0DB8:0001:0002::ffff").0, k("ip:[2001:db8:1:2:0:0:0:ffff]").0);
        assert_eq!(k("ip:2001:0DB8:0001:0002::ffff").0, "ip:2001:db8:1:2::ffff");
        assert_ne!(k("ip:2001:db8:1:2::1").0, k("ip:2001:db8:1:2::2").0);
        assert_eq!(k("ip:2001:db8:1:2::1").1, k("ip:2001:db8:1:2::2").1);
        assert_ne!(k("ip:2001:db8:1:3::1").1, k("ip:2001:db8:1:2::1").1);
        assert_eq!(k("ip:::1"), ("ip:::1".into(), "ip6:0:0:0:0::/64".into()));
        // an IPv4 address mapped into IPv6 is that IPv4 address, both ways
        assert_eq!(k("ip:::ffff:1.2.3.4"), ("ip:1.2.3.4".into(), "ip:1.2.3.4".into()));
        // what is not an address is kept as it is
        assert_eq!(k("ip:app"), ("ip:app".into(), "ip:app".into()));
        assert_eq!(k("ip:"), ("ip:".into(), "ip:".into()));
    }
}
