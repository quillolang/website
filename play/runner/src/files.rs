//! A run's files: what is taken (paths, sizes, text only) and how they are written.

use serde_json::Value;
use std::collections::HashSet;
use std::fs::{self, DirBuilder, OpenOptions};
use std::io::{self, Write};
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt};
use std::path::Path;

pub const MAX_FILES: usize = 30;
pub const MAX_TOTAL: usize = 256 * 1024;
pub const MAX_DEPTH: usize = 3;
pub const MAX_PATH: usize = 200;

/// Path and text, sorted by path.
pub type Files = Vec<(String, String)>;

fn shown(p: &str) -> String {
    let s: String = p
        .chars()
        .take(60)
        .map(|c| if c.is_control() { '?' } else { c })
        .collect();
    if p.chars().count() > 60 {
        format!("{}...", s)
    } else {
        s
    }
}

/// Whether a file's path is one a run may have: names of letters, digits, `_`, `.` and
/// `-`, joined by `/`, at most three deep; no part empty, `.`, `..` or starting with `.`.
pub fn check_path(p: &str) -> Result<(), String> {
    let bad = |why: &str| Err(format!("`{}`: {}", shown(p), why));
    if p.is_empty() {
        return Err("a file has no name".into());
    }
    if p.len() > MAX_PATH {
        return bad("a path is at most 200 characters");
    }
    if p.starts_with('/') {
        return bad("a path starts from the program's folder, not with /");
    }
    let segs: Vec<&str> = p.split('/').collect();
    if segs.len() > MAX_DEPTH {
        return bad("at most 3 levels: folder/folder/file");
    }
    for s in &segs {
        if s.is_empty() {
            return bad("a path has no empty part (// or / at the end)");
        }
        if *s == "." || *s == ".." {
            return bad("`.` and `..` are not parts of a path here");
        }
        if s.starts_with('.') {
            return bad("a name does not start with `.`");
        }
        if !s
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'.' || b == b'-')
        {
            return bad("names are letters, digits, `_`, `.` and `-`");
        }
    }
    if p == "app.sock" {
        return bad("app.sock is where the program listens; give the file another name");
    }
    Ok(())
}

/// The files of a run, from `{"path": "text", ...}`.
pub fn validate(v: &Value) -> Result<Files, String> {
    let m = v.as_object().ok_or("`files` is an object of path: text")?;
    if m.is_empty() {
        return Err("there are no files: a program starts in main.qwe".into());
    }
    if m.len() > MAX_FILES {
        return Err(format!(
            "at most {} files, and there are {}",
            MAX_FILES,
            m.len()
        ));
    }
    let mut total = 0usize;
    let mut out: Files = Vec::with_capacity(m.len());
    for (p, c) in m {
        check_path(p)?;
        let c = c
            .as_str()
            .ok_or_else(|| format!("`{}` is not text", shown(p)))?;
        if c.contains('\0') {
            return Err(format!(
                "`{}` has a NUL byte: only text files run here",
                shown(p)
            ));
        }
        total += c.len();
        out.push((p.clone(), c.to_string()));
    }
    if total > MAX_TOTAL {
        return Err(format!(
            "the files are {} KB; at most {} KB in all",
            total.div_ceil(1024),
            MAX_TOTAL / 1024
        ));
    }
    if !m.contains_key("main.qwe") {
        return Err("main.qwe is missing: a program starts there".into());
    }
    let names: HashSet<&str> = m.keys().map(|k| k.as_str()).collect();
    let mut lower = HashSet::new();
    for p in m.keys() {
        let segs: Vec<&str> = p.split('/').collect();
        for i in 1..segs.len() {
            let prefix = segs[..i].join("/");
            if names.contains(prefix.as_str()) {
                return Err(format!("`{}` is a file and a folder", shown(&prefix)));
            }
        }
        if !lower.insert(p.to_ascii_lowercase()) {
            return Err(format!(
                "`{}` and another file differ only in case",
                shown(p)
            ));
        }
    }
    out.sort();
    Ok(out)
}

/// Removes a run's folder, without following a link in it (std's remove_dir_all opens
/// each folder without following links); a link or file in its place is removed itself.
pub fn remove_tree(dir: &Path) -> io::Result<()> {
    match fs::symlink_metadata(dir) {
        Ok(m) if m.is_dir() => fs::remove_dir_all(dir),
        Ok(_) => fs::remove_file(dir),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e),
    }
}

/// Writes `files` into `dir`, which must not exist yet: it is made here (so nothing is
/// in it but what is written), then filled by `write_into`.
pub fn write_tree(
    dir: &Path,
    files: &Files,
    owner: Option<(u32, u32)>,
    dir_mode: u32,
    file_mode: u32,
) -> io::Result<()> {
    DirBuilder::new().mode(dir_mode).create(dir)?;
    own(dir, owner)?;
    write_into(dir, files, owner, dir_mode, file_mode)
}

fn own(p: &Path, owner: Option<(u32, u32)>) -> io::Result<()> {
    if let Some((u, g)) = owner {
        std::os::unix::fs::lchown(p, Some(u), Some(g))?;
    }
    Ok(())
}

/// Writes `files` into the folder `dir`: each folder inside is made, or must be a real
/// folder (a link there is refused, not followed), and each file is made new (O_EXCL),
/// never through a link (O_NOFOLLOW). `owner` (uid, gid) owns what is made, when given.
pub fn write_into(
    dir: &Path,
    files: &Files,
    owner: Option<(u32, u32)>,
    dir_mode: u32,
    file_mode: u32,
) -> io::Result<()> {
    for (p, text) in files {
        check_path(p).map_err(|e| io::Error::new(io::ErrorKind::InvalidInput, e))?;
        let segs: Vec<&str> = p.split('/').collect();
        let mut cur = dir.to_path_buf();
        for s in &segs[..segs.len() - 1] {
            cur.push(s);
            match DirBuilder::new().mode(dir_mode).create(&cur) {
                Ok(()) => own(&cur, owner)?,
                Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {
                    let m = fs::symlink_metadata(&cur)?;
                    if !m.is_dir() {
                        return Err(io::Error::new(
                            io::ErrorKind::InvalidInput,
                            format!("{} is not a folder", cur.display()),
                        ));
                    }
                }
                Err(e) => return Err(e),
            }
        }
        cur.push(segs[segs.len() - 1]);
        let mut f = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(file_mode)
            .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
            .open(&cur)?;
        if let Some((u, g)) = owner {
            std::os::unix::fs::fchown(&f, Some(u), Some(g))?;
        }
        f.write_all(text.as_bytes())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn good_paths() {
        for p in [
            "main.qwe",
            "lib/tasks.qwe",
            "ui/a/b.qwe",
            "migrations/001_init.sql",
            "a-b_c.d",
            "public/style.css",
            "x",
        ] {
            assert!(check_path(p).is_ok(), "{}", p);
        }
    }

    #[test]
    fn bad_paths() {
        let long = "a".repeat(201);
        for p in [
            "",
            "/main.qwe",
            "../x",
            "a/../b",
            "a/./b",
            ".",
            "..",
            ".env",
            "lib/.hidden",
            ".quillo/native/x",
            "a//b",
            "a/",
            "a/b/c/d",
            "a b.qwe",
            "a\\b",
            "ü.qwe",
            "a:b",
            "a\0b",
            "a\nb",
            "app.sock",
            long.as_str(),
            "a/b/c/",
            "%2e%2e/x",
            "~/x",
            "*",
        ] {
            assert!(check_path(p).is_err(), "{:?} was taken", p);
        }
        assert!(
            check_path("lib/app.sock").is_ok(),
            "only the top-level app.sock is the socket"
        );
    }

    #[test]
    fn validate_takes_a_program() {
        let f = validate(&json!({"main.qwe": "print(1)", "lib/x.qwe": "fn x() = 1"})).unwrap();
        assert_eq!(
            f,
            vec![
                ("lib/x.qwe".to_string(), "fn x() = 1".to_string()),
                ("main.qwe".into(), "print(1)".into())
            ]
        );
    }

    #[test]
    fn validate_refuses() {
        let cases = [
            (json!([]), "object"),
            (json!("main.qwe"), "object"),
            (json!({}), "no files"),
            (json!({"lib/x.qwe": "x"}), "main.qwe is missing"),
            (json!({"main.qwe": 1}), "not text"),
            (json!({"main.qwe": null}), "not text"),
            (json!({"main.qwe": "a\u{0}b"}), "NUL"),
            (
                json!({"main.qwe": "x", "lib": "x", "lib/a.qwe": "y"}),
                "a file and a folder",
            ),
            (
                json!({"main.qwe": "x", "Lib.qwe": "x", "lib.qwe": "y"}),
                "only in case",
            ),
            (json!({"main.qwe": "x", "../etc/passwd": "y"}), "`..`"),
        ];
        for (v, want) in cases {
            let e = validate(&v).unwrap_err();
            assert!(e.contains(want), "{} gave {:?}, wanted {:?}", v, e, want);
        }
        let mut many = serde_json::Map::new();
        many.insert("main.qwe".into(), json!("x"));
        for i in 0..30 {
            many.insert(format!("f{}.qwe", i), json!("x"));
        }
        assert!(validate(&Value::Object(many))
            .unwrap_err()
            .contains("at most 30"));
        let big = "x".repeat(MAX_TOTAL);
        assert!(validate(&json!({"main.qwe": big, "b.qwe": "y"}))
            .unwrap_err()
            .contains("at most 256 KB"));
        assert!(
            validate(&json!({"main.qwe": "x".repeat(MAX_TOTAL)})).is_ok(),
            "exactly 256 KB is taken"
        );
    }

    fn tmp(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("qp-files-{}-{}", name, std::process::id()));
        let _ = remove_tree(&d);
        d
    }

    #[test]
    fn write_tree_writes_and_refuses_an_existing_folder() {
        let d = tmp("w");
        let f = validate(&json!({"main.qwe": "print(1)", "lib/a/b.qwe": "b", "lib/c.qwe": "c"}))
            .unwrap();
        write_tree(&d, &f, None, 0o700, 0o600).unwrap();
        assert_eq!(fs::read_to_string(d.join("lib/a/b.qwe")).unwrap(), "b");
        assert_eq!(fs::read_to_string(d.join("main.qwe")).unwrap(), "print(1)");
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(d.join("main.qwe"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
        // the folder is made here, never reused
        assert!(write_tree(&d, &f, None, 0o700, 0o600).is_err());
        remove_tree(&d).unwrap();
        assert!(!d.exists());
        remove_tree(&d).unwrap(); // gone already: fine
    }

    #[test]
    fn write_into_does_not_follow_links() {
        // A folder with links in it: neither a folder part nor a file is written through one.
        let d = tmp("l");
        let outside = tmp("l-outside");
        fs::create_dir(&outside).unwrap();
        fs::create_dir(&d).unwrap();
        std::os::unix::fs::symlink(&outside, d.join("lib")).unwrap();
        std::os::unix::fs::symlink(outside.join("main.qwe"), d.join("main.qwe")).unwrap();
        let lib = vec![("lib/a.qwe".to_string(), "y".to_string())];
        assert!(
            write_into(&d, &lib, None, 0o700, 0o600).is_err(),
            "a linked folder was followed"
        );
        let main = vec![("main.qwe".to_string(), "x".to_string())];
        assert!(
            write_into(&d, &main, None, 0o700, 0o600).is_err(),
            "a linked file was written through"
        );
        assert!(!outside.join("a.qwe").exists());
        assert!(!outside.join("main.qwe").exists());
        // and a path that check_path refuses is refused here too
        let bad = vec![("../x".to_string(), "y".to_string())];
        assert!(write_into(&d, &bad, None, 0o700, 0o600).is_err());
        assert!(
            write_tree(&d, &main, None, 0o700, 0o600).is_err(),
            "an existing folder is refused"
        );
        remove_tree(&d).unwrap();
        assert!(outside.exists(), "removing the tree followed the link out");
        // a link in place of the folder itself is removed, not followed
        std::os::unix::fs::symlink(&outside, &d).unwrap();
        remove_tree(&d).unwrap();
        assert!(outside.exists() && !d.exists());
        remove_tree(&outside).unwrap();
    }

    #[test]
    fn o_nofollow_refuses_a_link_as_the_file() {
        let d = tmp("n");
        fs::create_dir(&d).unwrap();
        let target = d.join("target");
        std::os::unix::fs::symlink(&target, d.join("main.qwe")).unwrap();
        let r = OpenOptions::new()
            .write(true)
            .create_new(true)
            .custom_flags(libc::O_NOFOLLOW)
            .open(d.join("main.qwe"));
        assert!(r.is_err());
        assert!(!target.exists());
        remove_tree(&d).unwrap();
    }
}
