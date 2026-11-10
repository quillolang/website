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
}
