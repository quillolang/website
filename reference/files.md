# files
files(str, str | null=, map | null=) -> response
group: Files and processes

### What it does

A folder of files served as a static host serves it, for a route to answer with:
`route GET /*path = files("site", path)`. The first argument is the folder, under the
program's folder; the second is the path asked for, as the route's rest parameter gives
it. A folder's `index.html` answers for the folder (`/` and `/docs/`), a path with no
extension finds the file with `.html` added (`/about` is `about.html`), a folder named
without its `/` is redirected to it with a `301` (`/docs` to `/docs/`, its query kept),
and a path that finds nothing gets the folder's `404.html` with the status `404`. Each
file goes out as `file()` sends it: its type from the extension, an `ETag`,
`Last-Modified`, ranges, and nothing added to it. The options map takes `index` (the
file a folder is answered with), `extensions` (the ones tried for a path that has
none), `not_found` (the page for a miss, or `null` for the plain `404`) and `cache`, as
`file()` takes it.

`quillo serve site` runs the same as a program of its own: one route, `files(".",
path)`, over the folder, with the options of `quillo run`, read as `run` reads them.
Its URLs are its own, so a file asked for with a `/` after it (`/a.txt/`, `/about/`) is
moved to its path without one (`301`, `cache-control: max-age=3600`), only when it would
be served there. In a route, `files()` serves what it is asked for: `a.txt/` is
`a.txt`, so a site whose URLs end in `/` keeps them.

### Examples

```quillo noexec
route GET /*path = files("site", path)
route GET /docs/*path = files("manual", path, { cache: "1h" })
route GET /app/*path = files("dist", path, { index: "home.htm", extensions: ["htm"], not_found: null })
```

Outside a request it can be looked at like any response:

```quillo
write_file("site/index.html", "<p>home</p>")?
write_file("site/about.html", "<p>about</p>")?
write_file("site/docs/index.html", "<p>docs</p>")?
write_file("site/404.html", "<p>no such page</p>")?
print(files("site", "").body, files("site", "about").body, files("site", "docs/").body)
let miss = files("site", "nothing")
print(miss.status, miss.body, miss.headers["etag"])
print(files("site", "about.html", { cache: "1h" }).headers["cache-control"])
```

```output
<p>home</p> <p>about</p> <p>docs</p>
404 <p>no such page</p> null
public, max-age=3600, immutable
```

### Edge cases

- Files whose names start with a dot are not served, nor anything inside a folder whose
  name does (`.env`, `.git/`), except `.well-known/` at the top of the folder. Nor are
  the program's own files, `.qwe`, `.qwer` and `.rs`, however the name is written for
  the file system: `lib.QWE` on macOS and Windows, `lib.qwe.` and `lib.qwe::$DATA` on
  Windows *(since 0.7)*, and a Windows short name (`ENV~1`) is refused.
- A file is judged by where it leads, not by the name asked for, and so are the index,
  extension and `404.html` pages. A link inside the folder to an ordinary file in it is
  served; a link to `.env` or `main.qwe` under a harmless name (`settings.txt ->
  ../.env`) is not. A link that leads through a dot folder is followed only through
  those a build or a package manager makes: `.pnpm`, `.vitepress/dist`,
  `.output/public`, `.next/static`, `.svelte-kit/output/client`, `.nuxt/dist/client`,
  `.vercel/output/static`, `.well-known` at the top, and `.pnpm`, `.deno`, `.bun` and
  `.store` directly under `node_modules`. Other dot folders (`.git`, `.ssh`, `.quillo`,
  `.vscode`, `.config`, `.cache`) stay refused.
- The program's own files are known by their device and inode as well as by name: the
  `.env` and `.env.*` (a service's too), the `--env-file` and `--tls-key` (kept by the
  path given, so a key renewed through a link stays refused), the `.qwe`, `.qwer` and
  `.rs` files loaded, and the databases open. A hard link to one, or one saved anew, is
  refused too.
- No SQLite database is served, whatever its name: each is known by its content (the
  header, a `-wal`, `-shm` or `-journal` beside it), the program's, a tenant's, another
  program's or one no one has open. `file("backup.db")` sends one named on purpose.
- Only regular files are served (not a FIFO, a device or a folder), and the file sent is
  the one judged. A file kept back is the miss a file not there is, with the folder's
  `404.html`.
- So a path from the visitor goes here, not to `file()`: `file("public/" + path)`
  serves `.env` and `main.qwe` when they are asked for, and `quillo check` warns about
  it (see [file](/docs/reference/file/)).
- A folder's redirect stays on the host: `//docs` goes to `/docs/`, never to another
  host *(since 0.7)*.
- A path with `..` finds nothing, and gets the `404` page.
- A path that leads out of the program's folder through a link, or through a link
  that leads nowhere, finds nothing too: the same `404`, whether a file or a folder is
  there or not, so a miss says nothing of the folder outside. The first such path is
  said once in the log, naming `--allow-path FOLDER`, the option of `quillo run` that lets the
  program reach a folder outside (`quillo run main.qwe --allow-path /srv/site`).
- It is the `fs` effect, as `file` is: a function declared `with` without `fs` cannot
  call it.
- The `404.html` page goes out without the validators of its own file (`ETag`,
  `Last-Modified`), as they would name another URL's answer. It is `no-cache`, with
  `cache` or without, so a file asked for before it was deployed is not missing in
  caches for a year, and it is sent whole, whatever `Range` or conditional the request
  had.
- `extensions: []` turns clean URLs off; `not_found: null` answers a miss with the plain
  `404`, `not found`.
- An HTML file goes out as it is on disk: the prefetch script Quillo adds to the pages a
  route makes is not added to it, so its `ETag` and a `Range` of it are of the file's
  own bytes.

```quillo
write_file("site/about.html", "<p>about</p>")?
write_file("site/notes.md", "# Notes")?
write_file("site/404.html", "<p>no such page</p>")?
print(files("site", "about", { extensions: [] }).status, files("site", "nothing", { not_found: null }).body)
print(files("site", "notes.md").headers["content-type"])
print(files("site", "../main.qwe").status)
print(files("site", "nothing", { cache: "1y" }).headers["cache-control"], files("site", "about.html/").status)
db.open("site/app.db")
db.exec("create table t (x)")
print(files("site", "app.db").status, file("site/app.db").status)
```

```output
404 not found
text/markdown; charset=utf-8
404
no-cache 200
404 200
```

### Errors

An option it does not take, an `index` that is not a file name, `extensions` that is not
a list, or options that are not a map, are runtime errors, not error values.

```quillo error
print(files("site", "a", { nope: 1 }))
```

```output
line 1: `files` has no option `nope`: it takes `index`, `extensions`, `not_found` and `cache`
```

```quillo error
print(files("site", "a", { index: 3 }))
```

```output
line 1: `files`'s index is a file name, got 3
```

### Chaining

It answers a route, with the rest of the path given to it:

```quillo noexec
route GET /*path = path | (p) => files("public", p)
```

### See also

[file](/docs/reference/file/), [respond](/docs/reference/respond/), [markdown_page](/docs/reference/markdown_page/), [redirect](/docs/reference/redirect/)
