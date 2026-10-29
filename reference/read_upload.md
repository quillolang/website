# read_upload
read_upload(map) -> str | error(str)
group: Files and processes

### What it does

The contents of a file the request uploaded, as text: for a CSV, a JSON file or a
script the user sends, read and used without saving it. The argument is a file record
from `request.files` (`{ field, filename, type, size }`) or the file a component passed
to a `server fn`. Bytes that are not UTF-8 are replaced, so a binary file comes out
garbled: save those with [save_upload](/docs/reference/save_upload/).

### Examples

```quillo noexec
route POST /import {
    let rows = read_upload(request.files.sheet)? | split("\n") | filter((l) => l != "")
    for r in rows {
        let [name, email] = split(r, ",")
        db.exec("insert into contacts (name, email) values (?, ?)", name, email)
    }
    redirect("/contacts")
}
```

### Edge cases

- Outside a request, or in a request that uploaded nothing, the result is an error
  value: `read_upload: the current request has no files`. A record that is not one of
  this request's files is an error value too.
- The text is the whole file in memory; the body's size is limited by `--max-body`
  (10 MiB by default).
- The file stays with the request: `read_upload` reads it as often as asked.

```quillo
let r = read_upload({ field: "sheet", filename: "a.csv", type: "text/csv", size: 10 })
print(r)
print(is_err(r), r.error)
print(read_upload({}) ?? "")
```

```output
err("read_upload: the current request has no files")
true read_upload: the current request has no files

```

### Errors

Every failure is an error value, so `?` answers the request with it and `??` gives a
default; nothing here is a runtime error.

### Chaining

```quillo noexec
route POST /settings {
    let s = request.files.config | read_upload | json.parse
    s?
}
```

### See also

[save_upload](/docs/reference/save_upload/), [read_file](/docs/reference/read_file/), [json.parse](/docs/reference/json.parse/), [split](/docs/reference/split/)
