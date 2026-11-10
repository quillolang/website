//! Just enough HTTP/1.1 for the proxy: a strict request-head parser, the rewrites a
//! preview request gets on its way to the program, and a filter for the program's
//! response head. Bodies are never parsed: each connection carries one request (the
//! program is asked to close after it) or one WebSocket.

use std::io::{self, Read, Write};

pub const MAX_HEAD: usize = 32 * 1024;
pub const MAX_RESPONSE_HEAD: usize = 64 * 1024;

#[derive(Debug, Clone, PartialEq)]
pub struct Head {
    pub method: String,
    pub target: String,
    pub version: String,
    /// Names as sent; values without the spaces around them.
    pub headers: Vec<(String, String)>,
}

impl Head {
    pub fn get(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }
    pub fn all<'a>(&'a self, name: &'a str) -> impl Iterator<Item = &'a str> + 'a {
        self.headers
            .iter()
            .filter(move |(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }
}

/// Where the head ends: just after the first empty line (`\r\n\r\n`).
pub fn head_end(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|w| w == b"\r\n\r\n").map(|i| i + 4)
}

pub enum ReadHead {
    /// The head (up to and with its empty line), and what came after it.
    Head(Vec<u8>, Vec<u8>),
    TooLarge,
    /// The connection closed (or timed out) before a whole head came.
    Closed,
}

/// Reads until a whole head is in, at most `max` bytes of it.
pub fn read_head<R: Read>(r: &mut R, max: usize) -> ReadHead {
    let mut buf = Vec::with_capacity(4096);
    let mut chunk = [0u8; 8192];
    loop {
        if let Some(end) = head_end(&buf) {
            if end > max {
                return ReadHead::TooLarge;
            }
            let rest = buf.split_off(end);
            return ReadHead::Head(buf, rest);
        }
        if buf.len() > max {
            return ReadHead::TooLarge;
        }
        match r.read(&mut chunk) {
            Ok(0) | Err(_) => return ReadHead::Closed,
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
        }
    }
}

fn is_tchar(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&b)
}

/// Parses a request head, refusing anything that two servers could read two ways:
/// bare CR or LF, folded lines, a space before a colon, more than one Host or
/// Content-Length, both Content-Length and Transfer-Encoding, a Transfer-Encoding
/// other than `chunked`, a target that is not a path.
pub fn parse_request(raw: &[u8]) -> Result<Head, &'static str> {
    let text = std::str::from_utf8(raw).map_err(|_| "the request head is not UTF-8")?;
    let body = text
        .strip_suffix("\r\n\r\n")
        .ok_or("the request head does not end with an empty line")?;
    if body
        .split("\r\n")
        .any(|l| l.contains('\r') || l.contains('\n'))
    {
        return Err("a bare CR or LF in the request head");
    }
    let mut lines = body.split("\r\n");
    let rl = lines.next().unwrap_or("");
    let mut parts = rl.split(' ');
    let (Some(method), Some(target), Some(version), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return Err("the request line is not METHOD /path HTTP/1.1");
    };
    if method.is_empty() || !method.bytes().all(is_tchar) {
        return Err("a bad method");
    }
    if !target.starts_with('/') || !target.bytes().all(|b| (0x21..=0x7e).contains(&b)) {
        return Err("the target is not a path");
    }
    if version != "HTTP/1.1" && version != "HTTP/1.0" {
        return Err("not HTTP/1.1 or HTTP/1.0");
    }
    let mut headers = Vec::new();
    for l in lines {
        if l.is_empty() {
            return Err("an empty header line");
        }
        if l.starts_with(' ') || l.starts_with('\t') {
            return Err("a folded header line");
        }
        let (n, v) = l.split_once(':').ok_or("a header line without a colon")?;
        if n.is_empty() || !n.bytes().all(is_tchar) {
            return Err("a header name with a space or another character names do not have");
        }
        let v = v.trim_matches(|c| c == ' ' || c == '\t');
        if v.bytes().any(|b| (b < 0x20 && b != b'\t') || b == 0x7f) {
            return Err("a control character in a header value");
        }
        headers.push((n.to_string(), v.to_string()));
    }
    let head = Head {
        method: method.into(),
        target: target.into(),
        version: version.into(),
        headers,
    };
    match head.all("host").count() {
        0 => return Err("no Host"),
        1 => {}
        _ => return Err("more than one Host"),
    }
    let cls: Vec<&str> = head.all("content-length").collect();
    if cls.len() > 1 {
        return Err("more than one Content-Length");
    }
    if let Some(cl) = cls.first() {
        if cl.is_empty() || cl.len() > 15 || !cl.bytes().all(|b| b.is_ascii_digit()) {
            return Err("a Content-Length that is not a number");
        }
    }
    let tes: Vec<&str> = head.all("transfer-encoding").collect();
    if !tes.is_empty() {
        if !cls.is_empty() {
            return Err("both Content-Length and Transfer-Encoding");
        }
        if tes.len() > 1 || !tes[0].eq_ignore_ascii_case("chunked") {
            return Err("a Transfer-Encoding other than chunked");
        }
    }
    Ok(head)
}

/// A Host's name: lowercase, without the port or a final dot.
pub fn host_name(host: &str) -> String {
    let h = host.trim().to_ascii_lowercase();
    let h = match h.rsplit_once(':') {
        Some((n, p)) if !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()) => n.to_string(),
        _ => h,
    };
    h.trim_end_matches('.').to_string()
}

/// Which slot a Host names: `s07.play.quillolang.org` is s07's when s07 is a slot.
pub fn slot_of(host: &str, suffix: &str, slots: &[String]) -> Option<usize> {
    let name = host_name(host);
    let label = name.strip_suffix(suffix)?.strip_suffix('.')?;
    slots.iter().position(|s| s == label)
}

pub fn path_of(target: &str) -> &str {
    target.split_once('?').map_or(target, |(p, _)| p)
}

pub fn query_param<'a>(target: &'a str, key: &str) -> Option<&'a str> {
    let (_, q) = target.split_once('?')?;
    q.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=').unwrap_or((kv, ""));
        (k == key).then_some(v)
    })
}

/// The values of every cookie called `name`, from every Cookie header.
pub fn cookie_values<'a>(head: &'a Head, name: &str) -> Vec<&'a str> {
    let mut out = Vec::new();
    for v in head.all("cookie") {
        for pair in v.split(';') {
            if let Some((n, val)) = pair.trim().split_once('=') {
                if n.trim() == name {
                    out.push(val.trim().trim_matches('"'));
                }
            }
        }
    }
    out
}

/// A Cookie header without the cookies called `name`; None when none is left.
pub fn strip_cookie(value: &str, name: &str) -> Option<String> {
    let kept: Vec<&str> = value
        .split(';')
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .filter(|p| p.split_once('=').map_or(p.trim(), |(n, _)| n.trim()) != name)
        .collect();
    (!kept.is_empty()).then(|| kept.join("; "))
}

fn tokens(v: &str) -> impl Iterator<Item = String> + '_ {
    v.split(',').map(|t| t.trim().to_ascii_lowercase())
}

/// A GET asking to become a WebSocket (`Connection: upgrade`, `Upgrade: websocket`).
pub fn is_websocket_upgrade(head: &Head) -> bool {
    head.method == "GET"
        && head
            .all("connection")
            .any(|v| tokens(v).any(|t| t == "upgrade"))
        && head
            .all("upgrade")
            .any(|v| tokens(v).any(|t| t == "websocket"))
}

/// The head as the program gets it: without the session cookie; asking the program to
/// close after its answer unless it becomes a WebSocket (so Limer never sends a second
/// request, maybe another host's, down this connection); an Upgrade other than to a
/// WebSocket is dropped. `xff`: an X-Forwarded-For to put in place of any sent.
pub fn forward_head(head: &Head, cookie: &str, upgrade: bool, xff: Option<&str>) -> Vec<u8> {
    let mut out = format!("{} {} {}\r\n", head.method, head.target, head.version);
    for (n, v) in &head.headers {
        let ln = n.to_ascii_lowercase();
        match ln.as_str() {
            "cookie" => {
                if let Some(v) = strip_cookie(v, cookie) {
                    out.push_str(&format!("{}: {}\r\n", n, v));
                }
            }
            "connection" | "keep-alive" | "proxy-connection" | "upgrade" if !upgrade => {}
            "x-forwarded-for" if xff.is_some() => {}
            _ => out.push_str(&format!("{}: {}\r\n", n, v)),
        }
    }
    if let Some(x) = xff {
        out.push_str(&format!("X-Forwarded-For: {}\r\n", x));
    }
    if !upgrade {
        out.push_str("Connection: close\r\n");
    }
    out.push_str("\r\n");
    out.into_bytes()
}

/// A Set-Cookie value without its Domain attribute (so the cookie stays on the preview's
/// own host); None when the cookie is the proxy's own.
pub fn filter_set_cookie(v: &str, cookie: &str) -> Option<String> {
    let mut parts = v.split(';');
    let first = parts.next().unwrap_or("").trim();
    let name = first.split_once('=').map_or(first, |(n, _)| n).trim();
    if name == cookie {
        return None;
    }
    let mut out = first.to_string();
    for a in parts {
        let a = a.trim();
        let an = a.split_once('=').map_or(a, |(n, _)| n).trim();
        if an.eq_ignore_ascii_case("domain") || a.is_empty() {
            continue;
        }
        out.push_str("; ");
        out.push_str(a);
    }
    Some(out)
}

/// The program's response head as the browser gets it: no Clear-Site-Data (its "cookies"
/// would clear every quillolang.org cookie, signing the visitor out of the site), no
/// Domain on a Set-Cookie (a cookie for all of quillolang.org), no Set-Cookie of the
/// proxy's own cookie. quillo's `X-Frame-Options: SAMEORIGIN` would keep the editor from
/// showing the preview in its frame: it goes, and `frame` (the editor's origin) is the
/// one page that may frame it (`Content-Security-Policy: frame-ancestors`). Gives the
/// status too.
pub fn filter_response(
    raw: &[u8],
    cookie: &str,
    frame: &str,
) -> Result<(u16, Vec<u8>), &'static str> {
    let body = raw.strip_suffix(b"\r\n\r\n").ok_or("no end of the head")?;
    let mut lines = body
        .split(|&b| b == b'\n')
        .map(|l| l.strip_suffix(b"\r").unwrap_or(l));
    let sl = lines.next().ok_or("no status line")?;
    if sl.len() < 12
        || !sl.starts_with(b"HTTP/1.")
        || sl[8] != b' '
        || !sl[9..12].iter().all(|b| b.is_ascii_digit())
    {
        return Err("a bad status line");
    }
    let status = std::str::from_utf8(&sl[9..12])
        .unwrap()
        .parse::<u16>()
        .unwrap();
    let mut out = Vec::with_capacity(raw.len());
    out.extend_from_slice(sl);
    out.extend_from_slice(b"\r\n");
    for l in lines {
        let colon = l
            .iter()
            .position(|&b| b == b':')
            .ok_or("a header line without a colon")?;
        let name = String::from_utf8_lossy(&l[..colon])
            .trim()
            .to_ascii_lowercase();
        match name.as_str() {
            "clear-site-data" | "x-frame-options" => continue,
            "set-cookie" => {
                let Ok(v) = std::str::from_utf8(&l[colon + 1..]) else {
                    continue;
                };
                if let Some(v) = filter_set_cookie(v.trim(), cookie) {
                    out.extend_from_slice(b"Set-Cookie: ");
                    out.extend_from_slice(v.as_bytes());
                    out.extend_from_slice(b"\r\n");
                }
            }
            _ => {
                out.extend_from_slice(l);
                out.extend_from_slice(b"\r\n");
            }
        }
    }
    if status >= 200 && !frame.is_empty() {
        out.extend_from_slice(
            format!("Content-Security-Policy: frame-ancestors {}\r\n", frame).as_bytes(),
        );
    }
    out.extend_from_slice(b"\r\n");
    Ok((status, out))
}

/// Copies the program's answer to the client: each head filtered (1xx ones too, then
/// the next), then the rest as it comes. Ok(false) when the program sent nothing.
pub fn relay_response<R: Read, W: Write>(
    up: &mut R,
    client: &mut W,
    cookie: &str,
    frame: &str,
) -> io::Result<bool> {
    let mut buf: Vec<u8> = Vec::with_capacity(8192);
    let mut chunk = [0u8; 16384];
    let mut sent = false;
    loop {
        let end = loop {
            if let Some(e) = head_end(&buf) {
                if e > MAX_RESPONSE_HEAD {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "the program's response head is too large",
                    ));
                }
                break Some(e);
            }
            if buf.len() > MAX_RESPONSE_HEAD {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "the program's response head is too large",
                ));
            }
            let n = up.read(&mut chunk)?;
            if n == 0 {
                break None;
            }
            buf.extend_from_slice(&chunk[..n]);
        };
        let Some(end) = end else {
            if !buf.is_empty() {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "the program closed inside its response head",
                ));
            }
            return Ok(sent);
        };
        let (status, head) = filter_response(&buf[..end], cookie, frame)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        client.write_all(&head)?;
        sent = true;
        buf.drain(..end);
        if (100..200).contains(&status) && status != 101 {
            continue;
        }
        client.write_all(&buf)?;
        io::copy(up, client)?;
        client.flush()?;
        return Ok(true);
    }
}

pub fn reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        302 => "Found",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        409 => "Conflict",
        411 => "Length Required",
        413 => "Payload Too Large",
        429 => "Too Many Requests",
        431 => "Request Header Fields Too Large",
        500 => "Internal Server Error",
        502 => "Bad Gateway",
        503 => "Service Unavailable",
        _ => "Status",
    }
}

/// A whole response that closes the connection.
pub fn response(
    status: u16,
    headers: &[(&str, String)],
    content_type: &str,
    body: &[u8],
) -> Vec<u8> {
    let mut out = format!("HTTP/1.1 {} {}\r\n", status, reason(status));
    for (n, v) in headers {
        out.push_str(&format!("{}: {}\r\n", n, v));
    }
    if !content_type.is_empty() {
        out.push_str(&format!("Content-Type: {}\r\n", content_type));
    }
    out.push_str(&format!(
        "Content-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    ));
    let mut b = out.into_bytes();
    b.extend_from_slice(body);
    b
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(s: &str) -> Result<Head, &'static str> {
        parse_request(s.as_bytes())
    }

    #[test]
    fn parses_a_request() {
        let h = req("GET /a?b=1 HTTP/1.1\r\nHost: s07.play.quillolang.org\r\nCookie: x=1;  __Host-play=abc\r\nX-Empty:\r\n\r\n").unwrap();
        assert_eq!(h.method, "GET");
        assert_eq!(h.target, "/a?b=1");
        assert_eq!(h.get("HOST"), Some("s07.play.quillolang.org"));
        assert_eq!(h.get("x-empty"), Some(""));
        assert_eq!(path_of(&h.target), "/a");
        assert_eq!(query_param(&h.target, "b"), Some("1"));
        assert_eq!(query_param(&h.target, "c"), None);
        assert_eq!(cookie_values(&h, "__Host-play"), vec!["abc"]);
    }

    #[test]
    fn refuses_what_could_be_read_two_ways() {
        let bad = [
            "GET / HTTP/1.1\r\n\r\n",                                                         // no Host
            "GET / HTTP/1.1\r\nHost: a\r\nHost: b\r\n\r\n",                                   // two Hosts
            "GET / HTTP/1.1\r\nHost: a\r\nhost: a\r\n\r\n",                                   // two, any case
            "GET / HTTP/1.1\r\nHost : a\r\n\r\n",                                             // space before the colon
            "GET / HTTP/1.1\r\nHo st: a\r\n\r\n",                                             // space in a name
            "GET / HTTP/1.1\r\nHost: a\r\n X-Folded: b\r\n\r\n",                              // folded
            "GET / HTTP/1.1\r\nHost: a\r\n\tX: b\r\n\r\n",                                    // folded with a tab
            "GET / HTTP/1.1\r\nHost: a\nX: b\r\n\r\n",                                        // bare LF
            "GET / HTTP/1.1\r\nHost: a\rX: b\r\n\r\n",                                        // bare CR
            "GET / HTTP/1.1\r\nHost: a\r\nContent-Length: 1\r\nContent-Length: 1\r\n\r\n",    // two lengths
            "GET / HTTP/1.1\r\nHost: a\r\nContent-Length: 1\r\nTransfer-Encoding: chunked\r\n\r\n",
            "GET / HTTP/1.1\r\nHost: a\r\nTransfer-Encoding: gzip, chunked\r\n\r\n",
            "GET / HTTP/1.1\r\nHost: a\r\nTransfer-Encoding: chunked\r\nTransfer-Encoding: chunked\r\n\r\n",
            "GET / HTTP/1.1\r\nHost: a\r\nContent-Length: -1\r\n\r\n",
            "GET / HTTP/1.1\r\nHost: a\r\nContent-Length: 1 2\r\n\r\n",
            "GET / HTTP/1.1\r\nHost: a\r\nX: a\u{1}b\r\n\r\n",                               // control character
            "GET http://evil/ HTTP/1.1\r\nHost: a\r\n\r\n",                                   // absolute form
            "GET * HTTP/1.1\r\nHost: a\r\n\r\n",
            "GET /a b HTTP/1.1\r\nHost: a\r\n\r\n",                                           // space in the target
            "GET  / HTTP/1.1\r\nHost: a\r\n\r\n",                                             // two spaces
            "GET / HTTP/2.0\r\nHost: a\r\n\r\n",
            "G(T / HTTP/1.1\r\nHost: a\r\n\r\n",
            "GET / HTTP/1.1\r\nHost: a\r\nNoColon\r\n\r\n",
            "GET / HTTP/1.1\r\nHost: a\r\n",                                                  // no empty line
        ];
        for b in bad {
            assert!(req(b).is_err(), "taken: {:?}", b);
        }
        assert!(
            parse_request(b"GET / HTTP/1.1\r\nHost: \xff\r\n\r\n").is_err(),
            "not UTF-8"
        );
        assert!(req("GET / HTTP/1.0\r\nHost: a\r\nTransfer-Encoding: Chunked\r\n\r\n").is_ok());
        assert!(req("POST / HTTP/1.1\r\nHost: a\r\nContent-Length: 12\r\n\r\n").is_ok());
    }

    #[test]
    fn hosts_name_slots() {
        let slots: Vec<String> = ["s01", "s07"].iter().map(|s| s.to_string()).collect();
        let sfx = "play.quillolang.org";
        assert_eq!(slot_of("s07.play.quillolang.org", sfx, &slots), Some(1));
        assert_eq!(slot_of("S07.PLAY.quillolang.org", sfx, &slots), Some(1));
        assert_eq!(slot_of("s07.play.quillolang.org:443", sfx, &slots), Some(1));
        assert_eq!(slot_of("s07.play.quillolang.org.", sfx, &slots), Some(1));
        assert_eq!(
            slot_of("s01.play.localhost:4310", "play.localhost", &slots),
            Some(0)
        );
        for h in [
            "s02.play.quillolang.org",
            "play.quillolang.org",
            "x.s07.play.quillolang.org",
            "s07play.quillolang.org",
            "s07.play.quillolang.org.evil",
            "s07.play.quillolang.org:x",
            "a@s07.play.quillolang.org",
            "",
            "s07",
        ] {
            assert_eq!(slot_of(h, sfx, &slots), None, "{}", h);
        }
    }

    #[test]
    fn cookies_are_found_and_stripped() {
        let h = req(
            "GET / HTTP/1.1\r\nHost: a\r\nCookie: a=1; play=t1\r\nCookie: play=\"t2\"; b=2\r\n\r\n",
        )
        .unwrap();
        assert_eq!(cookie_values(&h, "play"), vec!["t1", "t2"]);
        assert_eq!(
            cookie_values(&h, "Play"),
            Vec::<&str>::new(),
            "names are case-sensitive"
        );
        assert_eq!(
            strip_cookie("a=1; play=t; b=2", "play").as_deref(),
            Some("a=1; b=2")
        );
        assert_eq!(strip_cookie("play=t", "play"), None);
        assert_eq!(strip_cookie(" play=t ;play=u", "play"), None);
        assert_eq!(
            strip_cookie("player=1; play=t", "play").as_deref(),
            Some("player=1")
        );
        assert_eq!(
            strip_cookie("a=1;;b=2", "play").as_deref(),
            Some("a=1; b=2")
        );
    }

    #[test]
    fn forward_head_rewrites() {
        let h = req("GET /x HTTP/1.1\r\nHost: s01.play.localhost\r\nConnection: keep-alive\r\nKeep-Alive: 5\r\nCookie: play=t; a=1\r\nUpgrade: h2c\r\nX-Forwarded-For: 1.2.3.4\r\n\r\n").unwrap();
        assert!(!is_websocket_upgrade(&h));
        let f = String::from_utf8(forward_head(&h, "play", false, None)).unwrap();
        assert_eq!(f, "GET /x HTTP/1.1\r\nHost: s01.play.localhost\r\nCookie: a=1\r\nX-Forwarded-For: 1.2.3.4\r\nConnection: close\r\n\r\n");
        let f = String::from_utf8(forward_head(&h, "play", false, Some("9.9.9.9"))).unwrap();
        assert!(
            f.contains("X-Forwarded-For: 9.9.9.9\r\n") && !f.contains("1.2.3.4"),
            "{}",
            f
        );
        let only = req("GET / HTTP/1.1\r\nHost: a\r\nCookie: play=t\r\n\r\n").unwrap();
        assert!(!String::from_utf8(forward_head(&only, "play", false, None))
            .unwrap()
            .contains("Cookie"));
    }

    #[test]
    fn websocket_upgrades_keep_their_headers() {
        let h = req("GET /ws HTTP/1.1\r\nHost: a\r\nConnection: keep-alive, Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: k\r\n\r\n").unwrap();
        assert!(is_websocket_upgrade(&h));
        let f = String::from_utf8(forward_head(&h, "play", true, None)).unwrap();
        assert!(
            f.contains("Connection: keep-alive, Upgrade\r\n")
                && f.contains("Upgrade: websocket\r\n")
                && !f.contains("Connection: close"),
            "{}",
            f
        );
        let post = req("POST /ws HTTP/1.1\r\nHost: a\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nContent-Length: 0\r\n\r\n").unwrap();
        assert!(!is_websocket_upgrade(&post));
        let no_conn = req("GET /ws HTTP/1.1\r\nHost: a\r\nUpgrade: websocket\r\n\r\n").unwrap();
        assert!(!is_websocket_upgrade(&no_conn));
    }

    #[test]
    fn read_head_limits_and_splits() {
        let mut r: &[u8] = b"GET / HTTP/1.1\r\nHost: a\r\n\r\nBODY";
        match read_head(&mut r, MAX_HEAD) {
            ReadHead::Head(h, rest) => {
                assert!(h.ends_with(b"\r\n\r\n"));
                assert_eq!(rest, b"BODY");
            }
            _ => panic!(),
        }
        let big = format!(
            "GET / HTTP/1.1\r\nHost: a\r\nX: {}\r\n\r\n",
            "a".repeat(MAX_HEAD)
        );
        let mut r = big.as_bytes();
        assert!(matches!(read_head(&mut r, MAX_HEAD), ReadHead::TooLarge));
        let mut r: &[u8] = b"GET / HTTP/1.1\r\nHost: a\r\n";
        assert!(matches!(read_head(&mut r, MAX_HEAD), ReadHead::Closed));
    }

    #[test]
    fn set_cookie_loses_its_domain() {
        assert_eq!(
            filter_set_cookie("a=1; Domain=quillolang.org; Path=/; HttpOnly", "play").as_deref(),
            Some("a=1; Path=/; HttpOnly")
        );
        assert_eq!(
            filter_set_cookie("a=1; domain = .play.quillolang.org", "play").as_deref(),
            Some("a=1")
        );
        assert_eq!(
            filter_set_cookie("a=1;DOMAIN=x;Secure", "play").as_deref(),
            Some("a=1; Secure")
        );
        assert_eq!(filter_set_cookie("play=x; Path=/", "play"), None);
        assert_eq!(
            filter_set_cookie("a=domain=1; Path=/", "play").as_deref(),
            Some("a=domain=1; Path=/")
        );
    }

    #[test]
    fn response_heads_are_filtered() {
        let raw = b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nClear-Site-Data: \"cookies\"\r\nclear-site-data : \"*\"\r\nSet-Cookie: a=1; Domain=quillolang.org\r\nset-cookie: play=x\r\nContent-Length: 2\r\n\r\n";
        let (s, h) = filter_response(raw, "play", "").unwrap();
        assert_eq!(s, 200);
        assert_eq!(String::from_utf8(h).unwrap(), "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nSet-Cookie: a=1\r\nContent-Length: 2\r\n\r\n");
        assert!(filter_response(b"HTTX/1.1 200 OK\r\n\r\n", "play", "").is_err());
        assert!(filter_response(b"HTTP/1.1 2x0 OK\r\n\r\n", "play", "").is_err());
        assert!(filter_response(b"HTTP/1.1 200 OK\r\nbad line\r\n\r\n", "play", "").is_err());
        let (s, _) = filter_response(
            b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n\r\n",
            "play",
            "https://quillolang.org",
        )
        .unwrap();
        assert_eq!(s, 101);
    }

    #[test]
    fn the_editor_may_frame_the_preview() {
        let (_, h) = filter_response(b"HTTP/1.1 200 OK\r\nx-frame-options: SAMEORIGIN\r\nX-Frame-Options: DENY\r\nContent-Length: 0\r\n\r\n", "play", "https://quillolang.org").unwrap();
        assert_eq!(String::from_utf8(h).unwrap(), "HTTP/1.1 200 OK\r\nContent-Length: 0\r\nContent-Security-Policy: frame-ancestors https://quillolang.org\r\n\r\n");
        // not on a 1xx head
        let (_, h) = filter_response(
            b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n\r\n",
            "play",
            "https://quillolang.org",
        )
        .unwrap();
        assert!(!String::from_utf8(h).unwrap().contains("frame-ancestors"));
    }

    #[test]
    fn relay_filters_every_head_and_copies_the_body() {
        let up = b"HTTP/1.1 100 Continue\r\nClear-Site-Data: \"cookies\"\r\n\r\nHTTP/1.1 200 OK\r\nSet-Cookie: a=1; Domain=x\r\n\r\nbody bytes\r\n\r\nClear-Site-Data: \"cookies\"";
        let mut r: &[u8] = up;
        let mut out = Vec::new();
        assert!(relay_response(&mut r, &mut out, "play", "").unwrap());
        let s = String::from_utf8(out).unwrap();
        assert_eq!(s, "HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 200 OK\r\nSet-Cookie: a=1\r\n\r\nbody bytes\r\n\r\nClear-Site-Data: \"cookies\"", "the body is not filtered, only heads");
        // 101: the head, then a tunnel
        let mut r: &[u8] =
            b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n\r\n\x81\x02hi";
        let mut out = Vec::new();
        relay_response(&mut r, &mut out, "play", "").unwrap();
        assert!(out.ends_with(b"\x81\x02hi"));
        // nothing at all
        let mut r: &[u8] = b"";
        assert!(!relay_response(&mut r, &mut Vec::new(), "play", "").unwrap());
        // a head cut short
        let mut r: &[u8] = b"HTTP/1.1 200 OK\r\nX: y";
        assert!(relay_response(&mut r, &mut Vec::new(), "play", "").is_err());
        // too large a head
        let big = format!(
            "HTTP/1.1 200 OK\r\nX: {}\r\n\r\n",
            "a".repeat(MAX_RESPONSE_HEAD + 10)
        );
        let mut r = big.as_bytes();
        assert!(relay_response(&mut r, &mut Vec::new(), "play", "").is_err());
    }

    #[test]
    fn responses_close() {
        let r = String::from_utf8(response(
            404,
            &[("Cache-Control", "no-store".into())],
            "text/plain",
            b"no",
        ))
        .unwrap();
        assert_eq!(r, "HTTP/1.1 404 Not Found\r\nCache-Control: no-store\r\nContent-Type: text/plain\r\nContent-Length: 2\r\nConnection: close\r\n\r\nno");
    }
}
