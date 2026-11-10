//! A run's output as numbered lines, the last `keep` bytes of it kept.

use std::collections::VecDeque;

/// A line longer than this is cut into lines of this length.
pub const MAX_LINE: usize = 16 * 1024;

#[derive(Debug, Clone)]
pub struct Log {
    lines: VecDeque<(u64, String)>,
    /// The number the last line has (0 before the first).
    last: u64,
    bytes: usize,
    partial: Vec<u8>,
    keep: usize,
    /// How far into the program's output file this has read.
    pub offset: u64,
    /// After a skip, the bytes up to the next newline are a broken line: dropped.
    skip_to_newline: bool,
}

impl Log {
    pub fn new(keep: usize) -> Log {
        Log {
            lines: VecDeque::new(),
            last: 0,
            bytes: 0,
            partial: Vec::new(),
            keep,
            offset: 0,
            skip_to_newline: false,
        }
    }

    pub fn last(&self) -> u64 {
        self.last
    }

    fn add(&mut self, s: String) {
        self.last += 1;
        self.bytes += s.len();
        self.lines.push_back((self.last, s));
        while self.bytes > self.keep && self.lines.len() > 1 {
            if let Some((_, l)) = self.lines.pop_front() {
                self.bytes -= l.len();
            }
        }
    }

    fn flush(&mut self) {
        let mut b = std::mem::take(&mut self.partial);
        if b.last() == Some(&b'\r') {
            b.pop();
        }
        self.add(String::from_utf8_lossy(&b).into_owned());
    }

    /// Bytes the program printed, in order.
    pub fn push(&mut self, data: &[u8]) {
        for &b in data {
            if self.skip_to_newline {
                if b == b'\n' {
                    self.skip_to_newline = false;
                }
                continue;
            }
            if b == b'\n' {
                self.flush();
            } else {
                self.partial.push(b);
                if self.partial.len() >= MAX_LINE {
                    self.flush();
                }
            }
        }
    }

    /// Output from `bytes` further on was skipped (more than is kept came at once).
    pub fn skipped(&mut self, bytes: u64) {
        if !self.partial.is_empty() {
            self.flush();
        }
        self.add(format!("[{} bytes of output skipped]", bytes));
        self.skip_to_newline = true;
    }

    /// The program has ended: a last line without its newline is a line too.
    pub fn finish(&mut self) {
        if !self.partial.is_empty() {
            self.flush();
        }
        self.skip_to_newline = false;
    }

    /// A line of the runner's own, after the program's.
    pub fn note(&mut self, s: &str) {
        self.finish();
        self.add(s.to_string());
    }

    /// The lines after line `after`, at most `max` bytes of them (one at least), and the
    /// number of the last one given (`after` when none is).
    pub fn since(&self, after: u64, max: usize) -> (Vec<(u64, &str)>, u64) {
        let mut out = Vec::new();
        let mut size = 0;
        let mut next = after;
        for (n, l) in &self.lines {
            if *n <= after {
                continue;
            }
            if !out.is_empty() && size + l.len() > max {
                break;
            }
            size += l.len();
            out.push((*n, l.as_str()));
            next = *n;
        }
        (out, next)
    }

    pub fn to_json(&self, after: u64, max: usize) -> (serde_json::Value, u64) {
        let (lines, next) = self.since(after, max);
        (
            serde_json::Value::Array(
                lines
                    .into_iter()
                    .map(|(n, t)| serde_json::json!({"n": n, "text": t}))
                    .collect(),
            ),
            next,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lines_are_numbered_and_held_until_their_newline() {
        let mut l = Log::new(1024);
        l.push(b"one\ntw");
        assert_eq!(l.since(0, 100).0, vec![(1, "one")]);
        l.push(b"o\r\nthree");
        assert_eq!(l.since(0, 100).0, vec![(1, "one"), (2, "two")]);
        assert_eq!(l.since(1, 100), (vec![(2, "two")], 2));
        assert_eq!(l.since(2, 100), (vec![], 2));
        l.finish();
        assert_eq!(l.since(2, 100).0, vec![(3, "three")]);
        l.note("[stopped]");
        assert_eq!(l.since(3, 100).0, vec![(4, "[stopped]")]);
    }

    #[test]
    fn only_the_last_bytes_are_kept() {
        let mut l = Log::new(10);
        l.push(b"aaaa\nbbbb\ncccc\n");
        let (lines, next) = l.since(0, 100);
        assert_eq!(lines, vec![(2, "bbbb"), (3, "cccc")]);
        assert_eq!(next, 3);
        // asking after a dropped line starts at the first kept
        assert_eq!(l.since(1, 100).0.len(), 2);
    }

    #[test]
    fn an_answer_is_at_most_max_bytes_but_one_line_at_least() {
        let mut l = Log::new(1 << 20);
        l.push(b"12345\n12345\n12345\n");
        assert_eq!(l.since(0, 11).0.len(), 2);
        assert_eq!(l.since(0, 1).0.len(), 1);
        assert_eq!(l.since(0, 1).1, 1);
    }

    #[test]
    fn long_lines_are_cut_and_bad_utf8_is_replaced() {
        let mut l = Log::new(1 << 20);
        l.push(&vec![b'x'; MAX_LINE + 5]);
        l.finish();
        let (lines, _) = l.since(0, 1 << 20);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].1.len(), MAX_LINE);
        let mut l = Log::new(100);
        l.push(b"a\xffb\n");
        assert_eq!(l.since(0, 100).0, vec![(1, "a\u{fffd}b")]);
        // a character split across two pushes is whole
        let mut l = Log::new(100);
        let e = "é\n".as_bytes();
        l.push(&e[..1]);
        l.push(&e[1..]);
        assert_eq!(l.since(0, 100).0, vec![(1, "é")]);
    }

    #[test]
    fn a_skip_drops_the_broken_line() {
        let mut l = Log::new(100);
        l.push(b"ok\npart");
        l.skipped(5000);
        l.push(b"rest of a line\nnext\n");
        let (lines, _) = l.since(0, 1000);
        assert_eq!(
            lines,
            vec![
                (1, "ok"),
                (2, "part"),
                (3, "[5000 bytes of output skipped]"),
                (4, "next")
            ]
        );
    }

    #[test]
    fn json_shape() {
        let mut l = Log::new(100);
        l.push(b"a\n");
        let (v, next) = l.to_json(0, 100);
        assert_eq!(v, serde_json::json!([{"n": 1, "text": "a"}]));
        assert_eq!(next, 1);
    }
}
