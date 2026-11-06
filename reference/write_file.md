# write_file
write_file(str, any) -> null | error(str)
group: Files and processes

### What it does

Writes a value as text to a file under the program's folder, replacing what was there,
and makes the folders on the way. The value is written as `print` would show it: a
string as it is, a number as its digits, a map or a list in Quillo's notation (for JSON,
pass `json.stringify(v)`). It gives `null` when the file is written and an error value
when it cannot be.

### Examples

```quillo
print(write_file("notes/today.txt", "milk\neggs"))
print(read_file("notes/today.txt"))
print(write_file("out/report.json", json.stringify({ total: 3 })))
print(read_file("out/report.json"))
```

```output
null
milk
eggs
null
{"total":3}
```

### Edge cases

- Missing folders are made: `write_file("a/b/c/d.txt", ...)` works in an empty folder.
- An existing file is replaced, not appended to.
- Any value is written as its text: `42` becomes `42`, a map becomes `{ a: 1 }`, `null`
  becomes an empty file.
- A path with `..`, one starting at `/`, and the empty path are error values, and nothing
  is written, unless the `quillo run` option `--allow-path` names the folder it leads
  into, for a script used as a tool (`quillo run tool.qwe --allow-path /srv/shared`; see
  [the options](/docs/)); folders are made there too.
- Links are followed, and where they lead is what counts: a link inside the folder
  that leads inside it works as its target would, and one that leads out of the
  folder, or leads nowhere, is an error value, and nothing is written. A link that leads nowhere is
  refused because writing through it would make its target, wherever that is. The first such path is said once in the
  log, with where it leads and `--allow-path FOLDER`, which lets the program reach
  a folder outside on purpose.
- The program's own files are refused, with an error value saying so: the `.qwe` and
  Rust (`.qwer`, `.rs`) files it loaded (or a folder holding one), `.env` and `.env.*`,
  the paths given to `--env-file` and `--tls-key` (while nothing is there too), the
  SQLite databases it has open with their `-wal`, `-shm` and `-journal` files, a
  tenant's database not made yet, and anything in `migrations/`. Names are compared as
  the file system may take them, on every system: in any case and Unicode form (`.ENV`,
  `Main.QWE`), and as Windows reads them (cut at `:`, trailing dots and spaces dropped),
  so `.ENV` is not written to be read as the settings at the next start.

```quillo
print(write_file("a/b/c/d.txt", "deep"), read_file("a/b/c/d.txt"))
print(write_file("x.txt", "first"), write_file("x.txt", "second"), read_file("x.txt"))
print(write_file("n.txt", 42), read_file("n.txt"))
print(write_file("m.txt", { a: 1, b: [1, 2] }), read_file("m.txt"))
print(write_file("e.txt", null), len(read_file("e.txt")))
print(write_file("../x.txt", "x"), write_file("", "x"))
print(write_file(".ENV", "ADMIN=1"))
print(write_file("MAIN.QWE", "x"), write_file("main.qwe.", "x"))
```

```output
null deep
null null second
null 42
null { a: 1, b: [1, 2] }
null 4
err("write_file: path must stay inside the program's folder: ../x.txt") err("write_file: path must stay inside the program's folder: ")
err("write_file: will not write .ENV: it is the program's settings (.env)")
err("write_file: will not write MAIN.QWE: it is one of the program's own files") err("write_file: will not write main.qwe.: it is one of the program's own files")
```

### Errors

A path that leaves the folder, one of the program's own files, or a file the system
refuses to write, is an error value; `?` passes it on. A path that is not a string is a runtime error.

```quillo
let r = write_file("/tmp/x.txt", "x")
print(is_err(r), r.error)
```

```output
true write_file: path must stay inside the program's folder: /tmp/x.txt
```

```quillo error
print(write_file(42, "x"))
```

```output
line 1: `write_file` expects a str as argument 1, got int
```

### Chaining

The path comes first in a pipeline, so the text is given in the call:

```quillo
print("c.txt" | write_file("see"), "c.txt" | read_file)
print(["a.txt", "b.txt"] | map((p) => write_file(p, upper(p))), read_file("a.txt"))
```

```output
null see
[null, null] A.TXT
```

### See also

[read_file](/docs/reference/read_file/), [delete_file](/docs/reference/delete_file/), [json.stringify](/docs/reference/json.stringify/), [save_upload](/docs/reference/save_upload/)
