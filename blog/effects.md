---
title: Saying what a function may touch
date: 2024-09-13
summary: A function's signature says what goes in and what comes out, but not whether it writes to the database on the way. A short `with` clause can.
tags: design, language, checking
---
Reading a web codebase, the hardest question to answer is often the simplest: does this function talk to the database? Call the network? Read the clock? The signature does not say, and the answer can be three calls deep.

That matters more on the web than elsewhere. A function that only computes can run anywhere: in a test, in the browser, twice. One that writes cannot.

### Effects in the signature

```quillo
fn load_user(id: int) with db = db.one("select * from users where id = ?", id)
fn fetch_avatar(url: str) with http = http.get(url).body
fn profile(id: int) with db, http = { user: load_user(id), avatar: fetch_avatar(avatar_url(id)) }
```

`with db` declares that the function may use the database, and everything it calls is held to the same list. A function with no `with` that reaches for `db.*`, directly or through a helper, is a mistake the checker reports before the program runs.

### What it buys

- **Reading.** The signature answers the question the body would have taken minutes to answer.
- **Moving code.** A function with no effects can run in the browser as well as the server. The language can tell which is which, instead of the programmer remembering.
- **Safe defaults.** Code that must not write (a page fetched ahead of a click, a preview) can be held to that, and stopped if it tries.

The list is short on purpose: the database, the network, files, the environment, time and randomness. Enough to answer the useful questions, few enough that nobody has to look them up.

> **Since then:** `with` clauses are checked by `quillo check`, and the same idea decides what a component may run in the browser. See [Effects](/docs/language-tour/#effects).
