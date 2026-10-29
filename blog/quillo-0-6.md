---
title: Quillo 0.6: private names, plugins by name, and quillo install
date: 2026-10-29
summary: Quillo 0.6 lets a file keep names to itself, takes plugin functions by name and under names of your own, installs plugins from the catalog, and drops the quotes from use.
tags: release
---
Quillo 0.6 is out. Nothing in it breaks a program written for 0.5: every addition is something you opt into. Here is what is new.

### Private names

Every file a program `use`s puts its names in one namespace, so a helper called `total` in one file clashed with a `total` in another, and big programs prefixed everything. Now a file keeps its helpers to itself:

```quillo
// lib/cart.qwe
private let TAX = 0.12
private fn total(lines: list) = sum(lines | map((l) => l.price * l.qty))

public fn cart_total(lines: list) = total(lines) * (1 + TAX)
```

`private` goes before a `fn`, `view`, `component` or top-level `let`. Two files may each have a private `total`; another file that calls one is told it is private, and editors offer it only where it belongs. `public` says the default, for files that want to say what they offer.

### Plugins, by name

A `.qwer` file is Rust whose `pub fn`s become Quillo functions. Take only the ones you call, and give one another name when two plugins use the same:

```quillo
use cache_get as redis_get, cache_set as redis_set from redis
use memcache_get as memo_get from memory_cache.qwer
use csv_parse, csv_write from csv
```

A name a plugin does not have is an error that names the nearest it does, and two plugins exporting one name are now warned of, with the `as` that keeps both.

### quillo install

[The plugin catalog](/plugins/) has 237 plugins: CSV and Excel, JWT and two-factor codes, QR codes and PDFs, Redis, S3 and email, search, maps and more. Each one is versioned, and built and tested before the site is published.

```
quillo install csv qr jwt          # into this folder, hash and version checked
quillo install --update            # what the catalog has newer
quillo install --list pdf
```

### Paths without quotes

`use lib/auth.qwe`, or `use lib/auth` for a `.qwe` file. Quoted paths work as they always did.

### And the rest

Route groups (`routes /admin | auth.required { ... }`), `every` on the server for game loops and polls, a component's own scoped CSS, exact decimals from the database to the page, `--split`, `--scale` and `--join` for services, and the fixes from eight rounds of building real apps in Quillo. The [changelog](https://github.com/quillolang/quillo/blob/main/CHANGELOG.md) has them all.

### Next

Before 1.0, `.qwe` files get modules of their own: a file sees what it imports, and names can be taken from it as they are from plugins. It will come with a `quillo fix` that writes the imports for you.

> **Upgrade:** pull and build, `cargo build --release`. The [Rust page](/docs/rust/) and [the structure guide](/docs/structure/) cover the new parts.
