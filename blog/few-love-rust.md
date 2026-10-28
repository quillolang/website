---
title: Few love Rust
date: 2026-08-24
summary: Many admire Rust, and few want to write their web app in it. Quillo is written in Rust so that web developers get what Rust gives without writing it, and the few who love it still can.
tags: rust, design
---
Rust has topped Stack Overflow's developer survey for years, as the "most loved" language and now the "most admired". Ask the same developers what they write their web apps in, and few say Rust. Both are true, and they are not in conflict.

People admire what Rust gives: programs that do not crash on a null, that use every core without data races, that start in milliseconds and ship as one file. Fewer love what it asks: lifetimes, the borrow checker, a trait for every shape, minutes of compiling. For a systems library those costs pay for themselves. For a page that lists orders, they mostly do not.

### Rust underneath, so you do not have to

Quillo is written in Rust, and that is where Rust's gifts go:

- **One binary.** The HTTP server, the checker, the component compiler, SQLite and the language server, installed as one file.
- **Requests that do not stall each other.** A slow query holds up its own page, while the rest are answered.
- **No garbage-collector pauses** in the middle of a request.
- **Arithmetic at machine speed,** compiled with Cranelift, where a function only does numbers.

None of that asks you to think about ownership. A Quillo program is routes, views and functions, and a value is a value.

### For the few who love it

Some work wants Rust itself: decoding images, a parser, a crate that has no equal. For that, a `.qwer` file is Rust, used like any other file:

```quillo
use "imaging.qwer"

route GET /photos/:name = { brightness: brightness(`photos/${name}.jpg`)? }
```

Its `pub fn`s are the program's functions, its dependencies are listed at the top, and a Rust `Result` comes back as a value or an error value, so `?` and `??` work on it.

### The split that makes sense

Most of a web app is glue: read a request, ask the database, render a page. That is where a small, forgiving language pays off. A little of it is hard computing, where Rust shines. Quillo puts each where it belongs, and lets the admirers and the lovers of Rust work in the same program.

> **Read more:** [Rust](/docs/rust/) in the docs, and [Compiled numbers](/docs/compiled-numbers/).
