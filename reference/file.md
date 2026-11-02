# file
file(str, map | null=) -> response
group: Files and processes

### What it does

A response that sends a file from the program's folder, for a route to answer with:
`route GET /assets/*path = file("public/" + path)`. The content type comes from the
extension, the response carries an `ETag` and `Last-Modified`, and a browser that asks
with a current copy gets a `304` with no body. A file that is not there, a folder, or a
path with `..` or starting at `/` gives a `404` response, not an error. The options map
takes `cache`: seconds, or a duration like `"10m"`, `"12h"`, `"30d"`, `"1y"`, which lets
the browser keep the file that long without asking; without it the answer says
`no-cache` (keep it, but ask each time). It also takes `download`, a file name, and
`type`, a content type in place of the extension's. The file goes out as it is on disk:
an HTML file gets none of the scripts Quillo adds to the pages a route makes, so its
`ETag` and a `Range` of it are of the file's own bytes. For a whole folder served as a
static host serves it (`index.html`, `/about` for `about.html`, `404.html`), see
[files](/docs/reference/files/).

### Examples

```quillo noexec
route GET /assets/*path = file("public/" + path)
route GET /build/*path = file("dist/" + path, { cache: "1y" })   // names that change with content
```

The value can be looked at like any response: its status, headers and body.

```quillo
write_file("public/app.css", "body { margin: 0 }")
let r = file("public/app.css")
print(r)
print(r.status, r.headers["content-type"], r.headers["cache-control"])
print(r.body)
print(file("public/app.css", { cache: "1y" }).headers["cache-control"])
```

```output
<response 200>
200 text/css; charset=utf-8 no-cache
body { margin: 0 }
public, max-age=31536000, immutable
```

### Edge cases

- A missing file is a `404` response whose body is `not found`; so is a folder, a path
  with `..` or one starting at `/`. It is never an error value, so `??` and `is_err`
  do not see it.
- Links are followed, and where they lead is what counts: a link inside the folder
  that leads inside it works as its target would, and one that leads out of the
  folder, or leads nowhere, is the same `404`. The first such path is said once in the
  log, with where it leads and `--allow-path FOLDER`, the option of `quillo run` that
  lets the program reach a folder outside on purpose (`quillo run main.qwe --allow-path
  /srv/media`; see [the options](/docs/)).
- An extension the list does not know is sent as `application/octet-stream`. The list:
  `html htm css js mjs json map webmanifest xml xsl txt text md markdown csv tsv svg
  png jpg jpeg gif webp avif bmp tif tiff heic jxl ico mp4 m4v mov webm m4a aac flac
  opus mp3 ogg oga wav wasm woff2 woff ttf otf pdf zip`, and for feeds, calendars,
  subtitles and streams `rss atom jsonld geojson yaml yml toml ics vtt srt m3u8 mpd ts
  m4s`. A `.md` file is `text/markdown; charset=utf-8`.
- A request's conditions are read as HTTP says: `If-None-Match`, else
  `If-Modified-Since`, gives a `304` when the file has not changed since the date given,
  a later date included, in any of HTTP's three date forms (`Sun, 06 Nov 1994 08:49:37
  GMT`, `Sunday, 06-Nov-94 08:49:37 GMT`, `Sun Nov  6 08:49:37 1994`). `If-Match` that
  names another version, or `If-Unmodified-Since` before the file changed, gives a
  `412` with no body. A date that does not parse is not a condition.
- `cache` can be a number of seconds; the header is then `public, max-age=N, immutable`.
- Files up to 1 MiB are kept in memory and re-read when they change; larger ones are
  streamed from disk, and a `Range` request gets a `206` with those bytes.

```quillo
write_file("data.bin", "x")
print(file("nope.txt").status, file("nope.txt").body)
print(file("../secret").status, file("/etc/hosts").status, file("public").status)
print(is_err(file("nope.txt")))
print(file("data.bin").headers["content-type"])
print(file("data.bin", { cache: 60 }).headers["cache-control"])
```

```output
404 not found
404 404 404
false
application/octet-stream
public, max-age=60, immutable
```

### Errors

A path that is not a string, options that are not a map, or a `cache` that is neither
seconds nor a duration are runtime errors, not error values. The options are only
looked at for a file that exists: `file("nope", { cache: "soon" })` is a plain `404`.

```quillo error
write_file("a.txt", "a")
print(file("a.txt", { cache: "soon" }))
```

```output
line 2: `file`'s cache is seconds or a duration like "30d", got "soon"
```

### Chaining

In a pipeline the path comes first; the options follow in the call:

```quillo
write_file("public/app.js", "1")
let path = "app.js"
print("public/" + path | file)
print(("public/" + path | file({ cache: "1y" })).headers["cache-control"])
```

```output
<response 200>
public, max-age=31536000, immutable
```

### See also

[read_file](/docs/reference/read_file/), [write_file](/docs/reference/write_file/), [respond](/docs/reference/respond/), [redirect](/docs/reference/redirect/), [image.convert](/docs/reference/image.convert/)
