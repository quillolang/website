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
path)`, over the folder, with the options of `quillo run`.

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
  the program's own files: `.qwe`, `.qwer` and `.rs`.
- A path with `..` finds nothing, and gets the `404` page.
- A path that leads out of the program's folder through a link, or through a link
  that leads nowhere, finds nothing too: the same `404`, whether a file or a folder is
  there or not, so a miss says nothing of the folder outside. The first such path is
  said once in the log, naming `--allow-path FOLDER`, the option of `quillo run` that lets the
  program reach a folder outside (`quillo run main.qwe --allow-path /srv/site`). A link that stays inside the
  folder works.
- It is the `fs` effect, as `file` is: a function declared `with` without `fs` cannot
  call it.
- The `404.html` page goes out without the validators of its own file (`ETag`,
  `Last-Modified`), as they would name another URL's answer.
- `extensions: []` turns clean URLs off; `not_found: null` answers a miss with the plain
  `404`, `not found`.
- An HTML file goes out as it is on disk: the prefetch script Quillo adds to the pages a
  route makes is not added to it, so its `ETag` and a `Range` of it are of the file's
  own bytes.

```quillo
write_file("site/about.html", "<p>about</p>")?
write_file("site/notes.md", "# Notes")?
print(files("site", "about", { extensions: [] }).status, files("site", "nothing", { not_found: null }).body)
print(files("site", "notes.md").headers["content-type"])
print(files("site", "../main.qwe").status)
```

```output
404 not found
text/markdown; charset=utf-8
404
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
