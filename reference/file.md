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
`no-cache` (keep it, but ask each time).

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
- An extension the list does not know (`html css js json svg png jpg webp mp4 pdf zip`
  and the others in the guide) is sent as `application/octet-stream`.
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
