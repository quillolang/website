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

```quillo noexec
route POST /avatar {
    let f = request.files.photo
    if f.size > 2_000_000 { reply 413 "Photos up to 2 MB" }
    save_upload(f, `uploads/${uuid()}.png`)?          // into the program's folder
    redirect("/profile")
}
```

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
  the database if it matters.
- Outside a request, or in a request that uploaded nothing, the result is an error
  value: `save_upload: the current request has no files`. So is a record that is not one
  of this request's files.
- The record carries `start` and `end`, the file's place in the body; a map without
  them is not a file (`expects a file from request.files`).
- The bytes are written as they are, so an image stays an image; `read_file` of the
  saved path reads them as text.

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
