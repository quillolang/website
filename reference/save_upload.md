# save_upload
save_upload(map, str) -> str | error(str)
group: Files and processes

### What it does

Writes a file the request uploaded to a path under the program's folder, making
folders as needed, and gives the path back. The first argument is a file record from
`request.files` (`{ field, filename, type, size }`, from a form with
`enctype="multipart/form-data"`), or the file a component passed to a `server fn`. The
bytes stay with the request until saved, so call it in the route or server fn that
received them.

### Examples

A page with a form, and the route it posts to. The form needs `method="post"` and
`enctype="multipart/form-data"` (without it the browser sends only the file's name), and
the file input's `name` is its key in `request.files`:

```quillo noexec
route GET /avatar =
    <form method="post" action="/avatar" enctype="multipart/form-data">
        <label>Your photo <input type="file" name="photo" accept="image/*" required/></label>
        <button>Upload</button>
    </form>

route POST /avatar {
    let f = request.files.photo
    if f == null { reply 400 "Choose a photo" }                 // `required` can be skipped
    if f.size > 2_000_000 { reply 413 "Photos up to 2 MB" }
    let path = save_upload(f, `uploads/${uuid()}.png`)?        // into the program's folder
    redirect(`/${path}`)
}

route GET /uploads/:name = file(`uploads/${name}`)
```

Several files from one input with `multiple`, and a text field beside them:

```quillo noexec
route GET /docs =
    <form method="post" action="/docs" enctype="multipart/form-data">
        <input type="text" name="title"/>
        <input type="file" name="docs" accept=".pdf" multiple/>
        <button>Send</button>
    </form>

route POST /docs { files: { docs: [map] } } {
    for d in docs { save_upload(d, `uploads/${uuid()}.pdf`)? }
    `${request.form.title}: ${len(docs)} saved`
}
```

From a component, a file goes to a `server fn` as it is chosen, with no form:

```quillo noexec
server fn add_photo(file: map) = save_upload(file, `photos/${uuid()}.jpg`)

component Photo() {
    state saved = null
    <input type="file" accept="image/*" @change={(e) => { saved = add_photo(e.target.files[0]) }}/>
}
```

### Edge cases

- The path is yours to choose: `filename` is what the browser sent, stripped of folders,
  and is not safe as a path. Name the file with `uuid()` and keep the original name in
  the database if it matters. Clients other than browsers are read too: a `\"` in a
  quoted name (Go, curl) is a `"`, and `filename*=UTF-8''...` gives the name when no
  plain `filename` is there.
- A form of more than 1,000 parts, fields and files together, is answered `413` before
  the route runs.
- Outside a request, or in a request that uploaded nothing, the result is an error
  value: `save_upload: the current request has no files`. So is a record that is not one
  of this request's files.
- The record carries `start` and `end`, the file's place in the body; a map without
  them is not a file (`expects a file from request.files`).
- The bytes are written as they are, so an image stays an image; `read_file` of the
  saved path reads them as text.
- It is the `fs` effect, as `write_file` is: a function declared `with` without `fs`
  cannot call it, in `quillo check` and when it runs.
- Links are followed: a path that leads out of the program's folder through a link, or
  through a link that leads nowhere, is refused, and nothing is written. A link that
  stays inside the folder works.
- The program's own files are refused with an error value, as `write_file` refuses
  them: its `.qwe` and Rust files, `.env` and `.env.*`, the `--env-file` and
  `--tls-key`, the databases it has open and a tenant's database not made yet. Names are
  compared in any case and as Windows reads them, so an upload saved as `.ENV` or
  `Main.QWE` is refused too.

```quillo
let photo = { field: "photo", filename: "me.png", type: "image/png", size: 3 }
print(save_upload(photo, "uploads/a.png"))
print(save_upload(photo, "uploads/a.png") | is_err)
print(read_file("uploads/a.png") ?? "nothing was written")
```

```output
err("save_upload: the current request has no files")
true
nothing was written
```

### Errors

Having no file to save is an error value, which `?` turns into the request's answer. A
path that leaves the program's folder (`..`, or starting at `/`), or the empty path, is
a runtime error, checked before anything else; so is a path that is not a string.

```quillo error
print(save_upload({}, "../a.png"))
```

```output
line 1: `save_upload` needs a path inside the program's folder, got "../a.png"
```

```quillo error
fn keep(u) with time = save_upload(u, "uploads/a.txt")
print(keep({ field: "f", filename: "a.txt", type: "text/plain", size: 1 }))
```

```output
line 1: `save_upload` needs the fs effect, but `keep` is declared `with time`
  in keep, called at main.qwe:2
```

### Chaining

The file comes first in a pipeline, the path in the call:

```quillo noexec
route POST /docs {
    let paths = request.files.docs | map((f) => f | save_upload(`docs/${uuid()}.pdf`))
    paths
}
```

### See also

[read_upload](/docs/reference/read_upload/), [write_file](/docs/reference/write_file/), [image.info](/docs/reference/image.info/), [image.convert](/docs/reference/image.convert/), [uuid](/docs/reference/uuid/)
