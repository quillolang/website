//! What the proxy needs of whoever runs the programs: the spawner (through its socket)
//! on the server, or plain child processes in dev mode.

use crate::files::Files;
use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::{self, Read, Seek, SeekFrom};
use std::os::unix::fs::OpenOptionsExt;
use std::os::unix::net::UnixStream;
use std::path::Path;

#[derive(Debug, Clone, PartialEq)]
pub struct Status {
    pub running: bool,
    /// The exit code; 128 + the signal when a signal ended it.
    pub exit: Option<i32>,
    /// systemd's Result (success, exit-code, signal, timeout, oom-kill, core-dump), or
    /// the like in dev mode.
    pub result: Option<String>,
}

impl Status {
    pub fn gone() -> Status {
        Status {
            running: false,
            exit: None,
            result: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Chunk {
    pub data: Vec<u8>,
    /// The offset after `data`.
    pub next: u64,
    /// The output file's size.
    pub size: u64,
}

pub trait Backend: Send + Sync {
    /// Starts slot's program on these files (stopping what ran there before).
    fn start(&self, slot: &str, files: &Files) -> Result<(), String>;
    /// A connection to the slot's program.
    fn connect(&self, slot: &str) -> Result<UnixStream, String>;
    fn status(&self, slots: &[String]) -> HashMap<String, Status>;
    /// The program's output from `offset`, at most `max` bytes.
    fn log(&self, slot: &str, offset: u64, max: usize) -> Result<Chunk, String>;
    fn stop(&self, slot: &str);
    fn stop_all(&self);
}

/// Reads an output file from `offset` (never through a link), ending on a whole UTF-8
/// character.
pub fn read_log_file(path: &Path, offset: u64, max: usize) -> io::Result<Chunk> {
    let mut f = match OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(path)
    {
        Ok(f) => f,
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            return Ok(Chunk {
                data: Vec::new(),
                next: offset,
                size: 0,
            })
        }
        Err(e) => return Err(e),
    };
    let size = f.metadata()?.len();
    if offset >= size {
        return Ok(Chunk {
            data: Vec::new(),
            next: offset,
            size,
        });
    }
    f.seek(SeekFrom::Start(offset))?;
    let want = ((size - offset) as usize).min(max);
    let mut data = vec![0u8; want];
    let mut got = 0;
    while got < want {
        let n = f.read(&mut data[got..])?;
        if n == 0 {
            break;
        }
        got += n;
    }
    data.truncate(got);
    let cut = crate::util::utf8_cut(&data);
    data.truncate(cut);
    Ok(Chunk {
        next: offset + data.len() as u64,
        data,
        size,
    })
}

/// What the end of a run says, for its Output: from its status.
pub fn ending_note(st: &Status, memory: &str) -> String {
    match st.result.as_deref() {
        Some("oom-kill") => format!("[stopped: the program used more than {} of memory]", memory),
        Some("timeout") => "[stopped: a run may take at most 10 minutes]".into(),
        _ => match st.exit {
            Some(0) => "[the program ended]".into(),
            Some(c) if c == 128 + 25 => {
                "[stopped: the program wrote more than 16 MB to one file]".into()
            }
            Some(c) if c > 128 => format!("[the program was ended by signal {}]", c - 128),
            Some(c) => format!("[the program ended with exit code {}]", c),
            None => "[the program ended]".into(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_log_from_an_offset() {
        let p = std::env::temp_dir().join(format!("qp-log-{}", std::process::id()));
        std::fs::write(&p, "hello é world").unwrap();
        let c = read_log_file(&p, 0, 5).unwrap();
        assert_eq!(c.data, b"hello");
        assert_eq!(c.next, 5);
        assert_eq!(c.size, 14);
        // a cut inside é backs off to before it
        let c = read_log_file(&p, 0, 7).unwrap();
        assert_eq!(c.data, b"hello ");
        let c = read_log_file(&p, 6, 100).unwrap();
        assert_eq!(String::from_utf8(c.data).unwrap(), "é world");
        let c = read_log_file(&p, 14, 100).unwrap();
        assert!(c.data.is_empty());
        assert_eq!(c.next, 14);
        std::fs::remove_file(&p).unwrap();
        let c = read_log_file(&p, 0, 100).unwrap();
        assert!(c.data.is_empty() && c.size == 0);
    }

    #[test]
    fn a_log_that_is_a_link_is_refused() {
        let d = std::env::temp_dir().join(format!("qp-loglink-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir(&d).unwrap();
        std::fs::write(d.join("secret"), "secret").unwrap();
        std::os::unix::fs::symlink(d.join("secret"), d.join("s01.log")).unwrap();
        assert!(read_log_file(&d.join("s01.log"), 0, 100).is_err());
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn notes() {
        let st = |exit, result: Option<&str>| Status {
            running: false,
            exit,
            result: result.map(String::from),
        };
        assert!(ending_note(&st(Some(137), Some("oom-kill")), "192M").contains("192M"));
        assert!(ending_note(&st(Some(143), Some("timeout")), "192M").contains("10 minutes"));
        assert!(ending_note(&st(Some(153), Some("signal")), "192M").contains("16 MB"));
        assert!(ending_note(&st(Some(137), Some("signal")), "192M").contains("signal 9"));
        assert!(ending_note(&st(Some(2), Some("exit-code")), "192M").contains("exit code 2"));
        assert_eq!(
            ending_note(&st(Some(0), Some("success")), "192M"),
            "[the program ended]"
        );
    }
}
