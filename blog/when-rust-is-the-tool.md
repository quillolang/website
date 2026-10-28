---
title: When Rust is the right tool
date: 2026-04-21
summary: Image processing, parsing, a fast library from crates.io. A .qwer file is Rust, used like a .qwe file, with its functions callable from Quillo.
tags: features, rust
---
Some work belongs in a systems language: decoding images, parsing a binary format, a library that only exists in Rust. A web language should not pretend otherwise, and should not make the bridge a project of its own.

### A Rust file, used like any other

```rust
//! [dependencies]
//! image = { version = "0.25", default-features = false, features = ["jpeg"] }

/// How bright a picture is, from 0 to 255.
pub fn brightness(path: &str) -> Result<f64, String> {
    let img = image::open(path).map_err(|e| e.to_string())?.to_luma8();
    Ok(img.pixels().map(|p| p.0[0] as f64).sum::<f64>() / img.len() as f64)
}
```

```quillo
use "imaging.qwer"

route GET /photos/:name = { brightness: brightness(`photos/${name}.jpg`)? }
```

A `.qwer` file is Rust. Its top-level `pub fn`s become the program's functions, its dependencies are listed at the top, and Quillo builds it.

### Values cross as they are

Integers, floats, bools and strings cross directly, `Vec` becomes a list, `HashMap<String, T>` a map, `Option<T>` the value or `null`. A `Result` becomes the value or an error value, so `?` and `??` work on Rust failures exactly as on Quillo's. For anything richer, `serde_json::Value` carries it.

### Where to draw the line

Crossing costs a conversion each way, so the bridge suits functions that do a lot of work per call: decoding an image, not adding two numbers. And for arithmetic, Quillo can often be fast enough on its own.

> **Read more:** [Rust](/docs/rust/) in the docs.
