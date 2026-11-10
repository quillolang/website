//! quillo-play: the runner behind quillolang.org/play/.
//!
//! Two processes on the server, one binary:
//! - `spawner` (root): makes and stops the sandboxes (transient systemd units), writes a
//!   run's files, reads its output, and hands the proxy a connection to a sandbox's
//!   socket once it has checked who listens on it. It never sees a visitor's bytes.
//! - `proxy` (user quillo-play): the website's API (run, log, stop) and the previews'
//!   traffic from Limer, which it checks (host, session cookie) and passes on.
//!
//! `dev` is both in one process with no sandbox at all, for working on the page locally.

pub mod backend;
pub mod client;
pub mod config;
pub mod dev;
pub mod fdpass;
pub mod files;
pub mod http;
pub mod log;
pub mod proxy;
pub mod sandbox;
pub mod spawner;
#[cfg(target_os = "linux")]
pub mod systemd;
pub mod table;
pub mod util;
