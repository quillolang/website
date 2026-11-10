//! The proxy's side of the spawner's socket: a Backend that asks the spawner.

use crate::backend::{Backend, Chunk, Status};
use crate::files::Files;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::time::Duration;

pub struct SpawnerClient {
    pub socket: PathBuf,
}

impl SpawnerClient {
    fn ask(&self, req: Value, wait: Duration) -> Result<(Value, Option<UnixStream>), String> {
        let s = UnixStream::connect(&self.socket)
            .map_err(|e| format!("cannot reach the spawner: {}", e))?;
        s.set_read_timeout(Some(wait)).ok();
        s.set_write_timeout(Some(Duration::from_secs(10))).ok();
        let mut line = req.to_string();
        line.push('\n');
        (&s).write_all(line.as_bytes())
            .map_err(|e| format!("the spawner: {}", e))?;
        let fd_op = req.get("op").and_then(|o| o.as_str()) == Some("connect");
        if fd_op {
            // the answer is one message, the socket with it
            let mut buf = [0u8; 4096];
            let (n, fd) =
                crate::fdpass::recv(&s, &mut buf).map_err(|e| format!("the spawner: {}", e))?;
            let v: Value =
                serde_json::from_slice(buf[..n].strip_suffix(b"\n").unwrap_or(&buf[..n]))
                    .map_err(|e| format!("the spawner's answer: {}", e))?;
            return Ok((v, fd.map(UnixStream::from)));
        }
        let mut r = BufReader::new(&s);
        let mut out = Vec::new();
        r.read_until(b'\n', &mut out)
            .map_err(|e| format!("the spawner: {}", e))?;
        let v: Value =
            serde_json::from_slice(&out).map_err(|e| format!("the spawner's answer: {}", e))?;
        Ok((v, None))
    }

    fn ok(v: &Value) -> Result<(), String> {
        if v.get("ok").and_then(|o| o.as_bool()) == Some(true) {
            Ok(())
        } else {
            Err(v
                .get("error")
                .and_then(|e| e.as_str())
                .unwrap_or("the spawner said no")
                .to_string())
        }
    }
}

impl Backend for SpawnerClient {
    fn start(&self, slot: &str, files: &Files) -> Result<(), String> {
        let m: serde_json::Map<String, Value> = files
            .iter()
            .map(|(p, t)| (p.clone(), Value::String(t.clone())))
            .collect();
        let (v, _) = self.ask(
            json!({"op": "start", "slot": slot, "files": m}),
            Duration::from_secs(30),
        )?;
        Self::ok(&v)
    }

    fn connect(&self, slot: &str) -> Result<UnixStream, String> {
        let (v, s) = self.ask(
            json!({"op": "connect", "slot": slot}),
            Duration::from_secs(5),
        )?;
        Self::ok(&v)?;
        s.ok_or_else(|| "the spawner sent no socket".to_string())
    }

    fn status(&self, slots: &[String]) -> HashMap<String, Status> {
        let mut out = HashMap::new();
        let Ok((v, _)) = self.ask(
            json!({"op": "status", "slots": slots}),
            Duration::from_secs(10),
        ) else {
            return out;
        };
        if let Some(m) = v.get("status").and_then(|s| s.as_object()) {
            for (k, s) in m {
                out.insert(
                    k.clone(),
                    Status {
                        running: s.get("running").and_then(|r| r.as_bool()).unwrap_or(false),
                        exit: s.get("exit").and_then(|e| e.as_i64()).map(|e| e as i32),
                        result: s.get("result").and_then(|r| r.as_str()).map(String::from),
                    },
                );
            }
        }
        out
    }

    fn log(&self, slot: &str, offset: u64, max: usize) -> Result<Chunk, String> {
        let (v, _) = self.ask(
            json!({"op": "log", "slot": slot, "offset": offset, "max": max}),
            Duration::from_secs(5),
        )?;
        Self::ok(&v)?;
        Ok(Chunk {
            data: v
                .get("data")
                .and_then(|d| d.as_str())
                .unwrap_or("")
                .as_bytes()
                .to_vec(),
            next: v.get("next").and_then(|n| n.as_u64()).unwrap_or(offset),
            size: v.get("size").and_then(|n| n.as_u64()).unwrap_or(0),
        })
    }

    fn stop(&self, slot: &str) {
        let _ = self.ask(json!({"op": "stop", "slot": slot}), Duration::from_secs(30));
    }

    fn stop_all(&self) {}
}
