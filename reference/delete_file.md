# delete_file
delete_file(str) -> null | error(str)
group: Files and processes

### What it does

Removes a file under the program's folder, or a folder and everything in it. It gives
`null` when the path is gone, also when there was nothing there, and an error value
when the path leaves the folder or names the folder itself.

### Examples

```quillo
write_file("tmp/a.txt", "a")
print(delete_file("tmp/a.txt"))
print(read_file("tmp/a.txt") ?? "gone")
```

```output
null
gone
```

### Edge cases

- Deleting what is not there is `null`, not an error: a second delete is harmless.
- A folder is removed with everything in it.
- `"."`, `""`, `".."` and a path starting at `/` are error values: the program's own
  folder is never removed, and nothing outside it is touched.

```quillo
print(delete_file("nope.txt"), delete_file("nope.txt"))
write_file("tmp/a/b.txt", "b")
write_file("tmp/c.txt", "c")
print(delete_file("tmp"), read_file("tmp/c.txt") ?? "gone")
print(delete_file("."), delete_file(""))
print(delete_file("../x"), delete_file("/tmp/x"))
```

```output
null null
null gone
err("delete_file: path must be inside the program's folder: .") err("delete_file: path must be inside the program's folder: ")
err("delete_file: path must be inside the program's folder: ../x") err("delete_file: path must be inside the program's folder: /tmp/x")
```

### Errors

A path outside the folder is an error value, which `?` passes on; a path that is not a
string is a runtime error.

```quillo
let r = delete_file("..")
print(is_err(r), r.error)
```

```output
true delete_file: path must be inside the program's folder: ..
```

```quillo error
print(delete_file(1))
```

```output
line 1: `delete_file` expects a str as argument 1, got int
```

### Chaining

```quillo
write_file("a.txt", "a")
write_file("b.txt", "b")
print(["a.txt", "b.txt"] | map(delete_file))
print("a.txt" | read_file ?? "gone")
```

```output
[null, null]
gone
```

### See also

[write_file](/docs/reference/write_file/), [read_file](/docs/reference/read_file/), [save_upload](/docs/reference/save_upload/)
