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
  is written.

```quillo
print(write_file("a/b/c/d.txt", "deep"), read_file("a/b/c/d.txt"))
print(write_file("x.txt", "first"), write_file("x.txt", "second"), read_file("x.txt"))
print(write_file("n.txt", 42), read_file("n.txt"))
print(write_file("m.txt", { a: 1, b: [1, 2] }), read_file("m.txt"))
print(write_file("e.txt", null), len(read_file("e.txt")))
print(write_file("../x.txt", "x"), write_file("", "x"))
```

```output
null deep
null null second
null 42
null { a: 1, b: [1, 2] }
null 4
err("write_file: path must stay inside the program's folder: ../x.txt") err("write_file: path must stay inside the program's folder: ")
```

### Errors

A path that leaves the folder, or a file the system refuses to write, is an error value;
`?` passes it on. A path that is not a string is a runtime error.

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
