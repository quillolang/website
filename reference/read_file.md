# read_file
read_file(str) -> str | error(str)
group: Files and processes

### What it does

The text of a file under the program's folder. The path is from that folder, wherever
Quillo runs. A file that is not there, or a path that leaves the folder (`..`, or one
starting at `/`), is an error value, not a runtime error, so a default can be given
with `??` and the failure looked at with `is_err`.

### Examples

```quillo
write_file("notes/today.txt", "milk\neggs")
print(read_file("notes/today.txt"))
print(read_file("notes/today.txt") | split("\n"))
print(read_file("notes/nope.txt") ?? "")
```

```output
milk
eggs
["milk", "eggs"]

```

### Edge cases

- A missing file is an error value that names the path and the system's reason.
- A path with `..`, one starting at `/`, and the empty path are error values: the
  program's folder is the limit, unless the `quillo run` option `--allow-path` names
  another folder, for a script used as a tool (`quillo run tool.qwe --allow-path
  /srv/shared`; see [the options](/docs/)). Then a path into `DIR` is read, by its own path
  or through `..`; where a link leads is what counts.
- Links are followed, and where they lead is what counts: a link inside the folder
  that leads inside it works as its target would, and one that leads out of the
  folder, or leads nowhere, is an error value as a path with `..` is (`path must stay inside the program's
  folder`). The first such path is said once in the
  log, with where it leads and `--allow-path FOLDER`, which lets the program reach
  a folder outside on purpose.
- A folder is an error value too.
- What comes back is always text: a number written with `write_file` is read as its
  digits. Parse it (`int`, `json.parse`) when a value is wanted.
- An empty file gives `""`. Text is read as UTF-8, characters not bytes: `len` counts
  characters.

```quillo
print(read_file("missing.txt"))
print(read_file("../secret.txt"), read_file("/etc/hosts"), read_file(""))
write_file("notes/a.txt", "x")
print(read_file("notes"))
write_file("n.txt", 42)
print(read_file("n.txt"), read_file("n.txt") == "42")
write_file("empty.txt", "")
print(read_file("empty.txt") == "")
write_file("u.txt", "añb €")
print(read_file("u.txt"), len(read_file("u.txt")))
```

```output
err("read_file: missing.txt: No such file or directory (os error 2)")
err("read_file: path must stay inside the program's folder: ../secret.txt") err("read_file: path must stay inside the program's folder: /etc/hosts") err("read_file: path must stay inside the program's folder: ")
err("read_file: notes: Is a directory (os error 21)")
42 true
true
añb € 5
```

### Errors

Every failure to read is an error value; `?` passes it on and `??` replaces it. A path
that is not a string is a runtime error, which stops the request.

```quillo
let r = read_file("missing.txt")
print(is_err(r), r.error)
```

```output
true read_file: missing.txt: No such file or directory (os error 2)
```

```quillo error
print(read_file(42))
```

```output
line 1: `read_file` expects a str as argument 1, got int
```

### Chaining

The path comes first in a pipeline, so `read_file` takes it as its only argument:

```quillo
write_file("config.json", json.stringify({ port: 8080 }))
print("config.json" | read_file | json.parse)
write_file("b.txt", "b")
print(["b.txt", "nope"] | map(read_file) | map((r) => r ?? "?"))
```

```output
{ port: 8080 }
["b", "?"]
```

### See also

[write_file](/docs/reference/write_file/), [stdin](/docs/reference/stdin/), [delete_file](/docs/reference/delete_file/), [file](/docs/reference/file/), [json.parse](/docs/reference/json.parse/), [is_err](/docs/reference/is_err/)
