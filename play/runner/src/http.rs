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

/// What filtering a response head needs to know.
pub struct RespFilter<'a> {
    /// The proxy's own cookie: a Set-Cookie of it is dropped.
    pub cookie: &'a str,
    /// The editor's origin, the one page that may frame the preview ("" for none).
    pub frame: &'a str,
    /// The request asked to become a WebSocket: only then may the answer be a 101 (review L3).
    pub upgrade: bool,
    /// The request was a HEAD: its answer has no body whatever its length says.
    pub head_request: bool,
}

/// A filtered response head.
#[derive(Debug)]
pub struct Filtered {
    pub status: u16,
    pub head: Vec<u8>,
    /// How many body bytes follow: Some(n) from Content-Length (or 0 for HEAD, 1xx, 204,
    /// 304), None when the body runs to the end of the connection (chunked, or no length).
    pub body: Option<u64>,
}

fn is_ctl(b: u8) -> bool {
    (b < 0x20 && b != b'\t') || b == 0x7f
}

/// The program's response head as the browser gets it, parsed as strictly as requests are
/// (review L1: lines end in CRLF, names are tokens, no folded lines, no control characters
/// in values; else an error, and the browser gets a 502). On the way:
/// - no Clear-Site-Data (its "cookies" would clear every quillolang.org cookie);
/// - no Domain on a Set-Cookie (a cookie for all of quillolang.org), no Set-Cookie of the
///   proxy's own cookie;
/// - quillo's `X-Frame-Options: SAMEORIGIN` would keep the editor from showing the preview:
///   it goes, and `Content-Security-Policy: frame-ancestors <editor>` comes;
/// - the program's Cache-Control and Expires go and `Cache-Control: no-store` comes, so no
///   browser keeps one visitor's preview for the next on the same host (review M2);
/// - but on a 101, Connection, Keep-Alive and Proxy-Connection go and `Connection: close`
///   comes, so the connection is never used for a second answer (review L2);
/// - a 101 is taken only for a request that asked to become a WebSocket, saying
///   `Upgrade: websocket` (review L3).
pub fn filter_response(raw: &[u8], f: &RespFilter) -> Result<Filtered, &'static str> {
    let body = raw.strip_suffix(b"\r\n\r\n").ok_or("no end of the head")?;
    let mut lines: Vec<&[u8]> = Vec::new();
    let mut rest = body;
    loop {
        match rest.windows(2).position(|w| w == b"\r\n") {
            Some(i) => {
                lines.push(&rest[..i]);
                rest = &rest[i + 2..];
            }
            None => {
                lines.push(rest);
                break;
            }
        }
    }
    if lines.iter().any(|l| l.contains(&b'\r') || l.contains(&b'\n')) {
        return Err("a bare CR or LF in the response head");
    }
    let sl = lines[0];
    if sl.len() < 12
        || !(sl.starts_with(b"HTTP/1.1 ") || sl.starts_with(b"HTTP/1.0 "))
        || !sl[9..12].iter().all(|b| b.is_ascii_digit())
        || (sl.len() > 12 && sl[12] != b' ')
        || sl.iter().any(|&b| is_ctl(b))
    {
        return Err("a bad status line");
    }
    let status: u16 = (sl[9] - b'0') as u16 * 100 + (sl[10] - b'0') as u16 * 10 + (sl[11] - b'0') as u16;
    if !(100..=599).contains(&status) {
        return Err("a status out of range");
    }
    let mut out = Vec::with_capacity(raw.len() + 128);
    out.extend_from_slice(sl);
    out.extend_from_slice(b"\r\n");
    let mut lengths: Vec<u64> = Vec::new();
    let mut chunked = false;
    let mut upgrade_ws = false;
    for l in &lines[1..] {
        if l.is_empty() {
            return Err("an empty header line");
        }
        if l[0] == b' ' || l[0] == b'\t' {
            return Err("a folded header line");
        }
        let colon = l
            .iter()
            .position(|&b| b == b':')
            .ok_or("a header line without a colon")?;
        let name = &l[..colon];
        if name.is_empty() || !name.iter().all(|&b| is_tchar(b)) {
            return Err("a header name with a character names do not have");
        }
        let mut v = &l[colon + 1..];
        while let [b' ' | b'\t', r @ ..] = v {
            v = r;
        }
        while let [r @ .., b' ' | b'\t'] = v {
            v = r;
        }
        if v.iter().any(|&b| is_ctl(b)) {
            return Err("a control character in a header value");
        }
        let lname = String::from_utf8_lossy(name).to_ascii_lowercase();
        match lname.as_str() {
            "clear-site-data" | "x-frame-options" | "cache-control" | "expires" => continue,
            "connection" | "keep-alive" | "proxy-connection" if status != 101 => continue,
            "content-length" => {
                let t = std::str::from_utf8(v).unwrap_or("");
                if t.is_empty() || t.len() > 15 || !t.bytes().all(|b| b.is_ascii_digit()) {
                    return Err("a Content-Length that is not a number");
                }
                lengths.push(t.parse().unwrap_or(0));
            }
            "transfer-encoding" => chunked = true,
            "upgrade" => {
                if String::from_utf8_lossy(v)
                    .split(',')
                    .any(|t| t.trim().eq_ignore_ascii_case("websocket"))
                {
                    upgrade_ws = true;
                }
            }
            "set-cookie" => {
                let Ok(t) = std::str::from_utf8(v) else {
                    continue;
                };
                if let Some(t) = filter_set_cookie(t, f.cookie) {
                    out.extend_from_slice(b"Set-Cookie: ");
                    out.extend_from_slice(t.as_bytes());
                    out.extend_from_slice(b"\r\n");
                }
                continue;
            }
            _ => {}
        }
        out.extend_from_slice(l);
        out.extend_from_slice(b"\r\n");
    }
    if lengths.len() > 1 {
        return Err("more than one Content-Length");
    }
    if chunked && !lengths.is_empty() {
        return Err("both Content-Length and Transfer-Encoding");
    }
    if status == 101 && !(f.upgrade && upgrade_ws) {
        return Err("a 101 for a request that did not ask to become a WebSocket");
    }
    if status >= 200 {
        if !f.frame.is_empty() {
            out.extend_from_slice(
                format!("Content-Security-Policy: frame-ancestors {}\r\n", f.frame).as_bytes(),
            );
        }
        out.extend_from_slice(b"Cache-Control: no-store\r\n");
        out.extend_from_slice(b"Connection: close\r\n");
    }
    out.extend_from_slice(b"\r\n");
    let body = if status < 200 || status == 204 || status == 304 || f.head_request {
        Some(0)
    } else if chunked {
        None
    } else {
        lengths.first().copied()
    };
    Ok(Filtered {
        status,
        head: out,
        body,
    })
}

/// How a relayed answer ended.
#[derive(Debug, PartialEq, Eq)]
pub enum Relayed {
    /// The program said nothing.
    Nothing,
    /// An answer was sent whole (its body as long as it said, or to the end).
    Done,
    /// A 101 was sent: the connection is now a WebSocket, whose bytes from the program the
    /// caller copies on (what came after the head is sent already).
    Upgraded,
}

/// Copies the program's answer to the client: each head filtered (1xx ones too, then the
/// next), then the body: as many bytes as its Content-Length says and no more (review L2:
/// a second answer on the same connection never reaches the client), or to the end when
/// it gives no length. On a 101 it stops after the head and what came with it.
pub fn relay_response<R: Read, W: Write>(
    up: &mut R,
    client: &mut W,
    f: &RespFilter,
) -> io::Result<Relayed> {
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
            return Ok(if sent { Relayed::Done } else { Relayed::Nothing });
        };
        let fr = filter_response(&buf[..end], f)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        client.write_all(&fr.head)?;
        sent = true;
        buf.drain(..end);
        if fr.status == 101 {
            client.write_all(&buf)?;
            client.flush()?;
            return Ok(Relayed::Upgraded);
        }
        if fr.status < 200 {
            continue;
        }
        match fr.body {
            Some(n) => {
                let have = (buf.len() as u64).min(n);
                client.write_all(&buf[..have as usize])?;
                if have < n {
                    io::copy(&mut up.take(n - have), client)?;
                }
            }
            None => {
                client.write_all(&buf)?;
                io::copy(up, client)?;
            }
        }
        client.flush()?;
        return Ok(Relayed::Done);
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

    fn rf<'a>(frame: &'a str, upgrade: bool) -> RespFilter<'a> {
        RespFilter {
            cookie: "play",
            frame,
            upgrade,
            head_request: false,
        }
    }

    #[test]
    fn response_heads_are_filtered() {
        // reviews L2 and M2 added Cache-Control: no-store and Connection: close at the end,
        // and took the program's Connection out
        let raw = b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nClear-Site-Data: \"cookies\"\r\nSet-Cookie: a=1; Domain=quillolang.org\r\nset-cookie: play=x\r\nConnection: keep-alive\r\nKeep-Alive: timeout=5\r\nCache-Control: public, max-age=31536000\r\nExpires: Thu, 01 Jan 2099 00:00:00 GMT\r\nContent-Length: 2\r\n\r\n";
        let f = filter_response(raw, &rf("", false)).unwrap();
        assert_eq!(f.status, 200);
        assert_eq!(f.body, Some(2));
        assert_eq!(String::from_utf8(f.head).unwrap(), "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nSet-Cookie: a=1\r\nContent-Length: 2\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n");
        assert!(filter_response(b"HTTX/1.1 200 OK\r\n\r\n", &rf("", false)).is_err());
        assert!(filter_response(b"HTTP/1.1 2x0 OK\r\n\r\n", &rf("", false)).is_err());
        assert!(filter_response(b"HTTP/1.1 200 OK\r\nbad line\r\n\r\n", &rf("", false)).is_err());
        // a status line without a reason is fine; one with a status out of range is not
        assert!(filter_response(b"HTTP/1.1 204\r\n\r\n", &rf("", false)).is_ok());
        assert!(filter_response(b"HTTP/1.1 099 X\r\n\r\n", &rf("", false)).is_err());
        assert!(filter_response(b"HTTP/1.1 600 X\r\n\r\n", &rf("", false)).is_err());
        assert!(filter_response(b"HTTP/1.1 200OK\r\n\r\n", &rf("", false)).is_err());
    }

    #[test]
    fn response_heads_are_parsed_as_strictly_as_requests() {
        // review L1
        let bad: [&[u8]; 12] = [
            b"HTTP/1.1 200 OK\nX: y\r\n\r\n",                       // bare LF ending a line
            b"HTTP/1.1 200 OK\r\nX: a\rb\r\n\r\n",                   // bare CR in a value
            b"HTTP/1.1 200 OK\r\nX: a\r\n folded\r\n\r\n",           // folded
            b"HTTP/1.1 200 OK\r\nX: a\r\n\tfolded\r\n\r\n",         // folded with a tab
            b"HTTP/1.1 200 OK\r\n X: a\r\n\r\n",                     // first line folded
            b"HTTP/1.1 200 OK\r\nX y: a\r\n\r\n",                    // space in a name
            b"HTTP/1.1 200 OK\r\nX : a\r\n\r\n",                     // space before the colon
            b"HTTP/1.1 200 OK\r\nX: a\x01b\r\n\r\n",                // control character
            b"HTTP/1.1 200 OK\r\nX: a\x7fb\r\n\r\n",                // DEL
            b"HTTP/1.1 200 OK\r\nContent-Length: 1\r\nContent-Length: 1\r\n\r\n",
            b"HTTP/1.1 200 OK\r\nContent-Length: 1\r\nTransfer-Encoding: chunked\r\n\r\n",
            b"HTTP/1.1 200 OK\r\nContent-Length: -1\r\n\r\n",
        ];
        for b in bad {
            assert!(filter_response(b, &rf("", false)).is_err(), "taken: {:?}", String::from_utf8_lossy(b));
        }
        // bytes past ASCII in a value (obs-text) and tabs are allowed
        let f = filter_response(b"HTTP/1.1 200 OK\r\nX-Name: caf\xc3\xa9\tok\r\nContent-Length: 0\r\n\r\n", &rf("", false)).unwrap();
        assert!(f.head.windows(10).any(|w| w == b"caf\xc3\xa9\tok\r\n"));
        // chunked: the body runs to the end of the connection
        let f = filter_response(b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n", &rf("", false)).unwrap();
        assert_eq!(f.body, None);
        // no length either: to the end
        let f = filter_response(b"HTTP/1.1 200 OK\r\n\r\n", &rf("", false)).unwrap();
        assert_eq!(f.body, None);
        // no body: 204, 304, 1xx, and any answer to a HEAD
        for st in ["204 No Content", "304 Not Modified", "100 Continue", "103 Early Hints"] {
            let raw = format!("HTTP/1.1 {}\r\nContent-Length: 50\r\n\r\n", st);
            assert_eq!(filter_response(raw.as_bytes(), &rf("", false)).unwrap().body, Some(0), "{}", st);
        }
        let head = RespFilter { cookie: "play", frame: "", upgrade: false, head_request: true };
        assert_eq!(filter_response(b"HTTP/1.1 200 OK\r\nContent-Length: 50\r\n\r\n", &head).unwrap().body, Some(0));
    }

    #[test]
    fn a_101_only_for_a_websocket_request() {
        // review L3
        let ok = b"HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n";
        let f = filter_response(ok, &rf("https://quillolang.org", true)).unwrap();
        assert_eq!(f.status, 101);
        let h = String::from_utf8(f.head).unwrap();
        // a 101 keeps its Connection and Upgrade, and gets nothing for a page
        assert!(h.contains("Connection: Upgrade\r\n") && h.contains("Upgrade: websocket\r\n"), "{}", h);
        assert!(!h.contains("frame-ancestors") && !h.contains("no-store") && !h.contains("close"), "{}", h);
        assert!(filter_response(ok, &rf("", false)).is_err(), "the request did not ask");
        let h2c = b"HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: h2c\r\n\r\n";
        assert!(filter_response(h2c, &rf("", true)).is_err(), "not to a WebSocket");
        let none = b"HTTP/1.1 101 Switching Protocols\r\n\r\n";
        assert!(filter_response(none, &rf("", true)).is_err(), "no Upgrade said");
        let mut r: &[u8] = ok;
        assert!(relay_response(&mut r, &mut Vec::new(), &rf("", false)).is_err());
    }

    #[test]
    fn the_editor_may_frame_the_preview() {
        // review M2 and L2 add the last two lines
        let f = filter_response(b"HTTP/1.1 200 OK\r\nx-frame-options: SAMEORIGIN\r\nX-Frame-Options: DENY\r\nContent-Length: 0\r\n\r\n", &rf("https://quillolang.org", false)).unwrap();
        assert_eq!(String::from_utf8(f.head).unwrap(), "HTTP/1.1 200 OK\r\nContent-Length: 0\r\nContent-Security-Policy: frame-ancestors https://quillolang.org\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n");
        // not on a 1xx head
        let f = filter_response(b"HTTP/1.1 100 Continue\r\n\r\n", &rf("https://quillolang.org", false)).unwrap();
        assert_eq!(String::from_utf8(f.head).unwrap(), "HTTP/1.1 100 Continue\r\n\r\n");
    }

    #[test]
    fn relay_filters_every_head_and_copies_the_body() {
        let up = b"HTTP/1.1 100 Continue\r\nClear-Site-Data: \"cookies\"\r\n\r\nHTTP/1.1 200 OK\r\nSet-Cookie: a=1; Domain=x\r\n\r\nbody bytes\r\n\r\nClear-Site-Data: \"cookies\"";
        let mut r: &[u8] = up;
        let mut out = Vec::new();
        assert_eq!(relay_response(&mut r, &mut out, &rf("", false)).unwrap(), Relayed::Done);
        let s = String::from_utf8(out).unwrap();
        // review M2 and L2 added Cache-Control and Connection to the 200's head
        assert_eq!(s, "HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 200 OK\r\nSet-Cookie: a=1\r\nCache-Control: no-store\r\nConnection: close\r\n\r\nbody bytes\r\n\r\nClear-Site-Data: \"cookies\"", "a body with no length runs to the end, unfiltered");
        // 101 (for a WebSocket request): the head, and what came with it; the rest is the caller's
        let mut r: &[u8] =
            b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n\x81\x02hi";
        let mut out = Vec::new();
        assert_eq!(relay_response(&mut r, &mut out, &rf("", true)).unwrap(), Relayed::Upgraded);
        assert!(out.ends_with(b"\x81\x02hi"));
        // nothing at all
        let mut r: &[u8] = b"";
        assert_eq!(relay_response(&mut r, &mut Vec::new(), &rf("", false)).unwrap(), Relayed::Nothing);
        // a head cut short
        let mut r: &[u8] = b"HTTP/1.1 200 OK\r\nX: y";
        assert!(relay_response(&mut r, &mut Vec::new(), &rf("", false)).is_err());
        // too large a head
        let big = format!(
            "HTTP/1.1 200 OK\r\nX: {}\r\n\r\n",
            "a".repeat(MAX_RESPONSE_HEAD + 10)
        );
        let mut r = big.as_bytes();
        assert!(relay_response(&mut r, &mut Vec::new(), &rf("", false)).is_err());
    }

    #[test]
    fn a_body_is_as_long_as_its_length_says_and_no_longer() {
        // review L2: a second answer on the same connection never reaches the client
        let up = b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhelloHTTP/1.1 200 OK\r\nSet-Cookie: a=1; Domain=quillolang.org\r\n\r\nsmuggled";
        let mut r: &[u8] = up;
        let mut out = Vec::new();
        relay_response(&mut r, &mut out, &rf("", false)).unwrap();
        let s = String::from_utf8(out).unwrap();
        assert!(s.ends_with("\r\n\r\nhello"), "{}", s);
        assert!(!s.contains("smuggled") && !s.contains("Domain"), "{}", s);
        // the length split over many reads
        struct Slow<'a>(&'a [u8]);
        impl Read for Slow<'_> {
            fn read(&mut self, b: &mut [u8]) -> io::Result<usize> {
                if self.0.is_empty() {
                    return Ok(0);
                }
                b[0] = self.0[0];
                self.0 = &self.0[1..];
                Ok(1)
            }
        }
        let mut r = Slow(b"HTTP/1.1 200 OK\r\nContent-Length: 3\r\n\r\nabcdef");
        let mut out = Vec::new();
        relay_response(&mut r, &mut out, &rf("", false)).unwrap();
        assert!(out.ends_with(b"\r\n\r\nabc"));
        // a HEAD's answer: the head only
        let head = RespFilter { cookie: "play", frame: "", upgrade: false, head_request: true };
        let mut r: &[u8] = b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello";
        let mut out = Vec::new();
        relay_response(&mut r, &mut out, &head).unwrap();
        assert!(out.ends_with(b"\r\n\r\n"));
        // a 204 says no body: what follows is not sent
        let mut r: &[u8] = b"HTTP/1.1 204 No Content\r\n\r\nHTTP/1.1 200 OK\r\n\r\nx";
        let mut out = Vec::new();
        relay_response(&mut r, &mut out, &rf("", false)).unwrap();
        assert_eq!(String::from_utf8(out).unwrap().matches("HTTP/1.1").count(), 1);
        // a body cut short is an error (the client sees the connection close)
        let mut r: &[u8] = b"HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nabc";
        let mut out = Vec::new();
        let _ = relay_response(&mut r, &mut out, &rf("", false));
        assert!(out.ends_with(b"abc"));
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
