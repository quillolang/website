# check_program
check_program(str, map | null=) -> list | error(str)
group: Files and processes

### What it does

What `quillo check` says of a program, as a list of `{ file, line, severity, message }`
maps, `severity` being `"error"` or `"warning"`; an empty list means the program is
fine. The path is from the program's folder. The map gives some files' text in place of
what is on disk, keyed by path, so a tool that writes Quillo code (a plugin editor, a
form's rule) can check it before saving it. The code checked may come from users, so it
reads nothing outside the program's folder.

### Examples

```quillo
write_file("plugins/greet.qwe", "fn greet(n: str) = upper(n)\nprint(greet(1))\n")
print(check_program("plugins/greet.qwe"))
print(check_program("plugins/greet.qwe", { "plugins/greet.qwe": "fn greet(n: str) = upper(n)\nprint(greet(\"ann\"))\n" }))
```

```output
[{ file: "plugins/greet.qwe", line: 2, severity: "error", message: "argument `n` of `greet` must be str, got int" }]
[]
```

### Edge cases

- Several problems come as several maps, each with its line; `filter` on `severity`
  keeps the errors.
- A file that does not exist is not an error value: it is a list with one error at
  line 0 saying the file cannot be read.
- A `use` in the checked code with `..` or starting at `/` is reported as an error on
  that line, not followed.
- The path itself, or a key of the map, that leaves the folder is an error value.
- `null` as the map checks what is on disk; an empty override checks an empty program,
  which is fine.

```quillo
write_file("plugins/p.qwe", "print(len(3))\nprint(nope)\nfn upper(s: str) = s\n")
print(check_program("plugins/p.qwe") | map((d) => `${d.severity} ${d.line}: ${d.message}`))
print(check_program("plugins/p.qwe") | filter((d) => d.severity == "error") | len)
print(check_program("nope.qwe"))
print(check_program("plugins/p.qwe", { "plugins/p.qwe": "use \"../secret.qwe\"\n" }))
print(check_program("../main.qwe"))
print(check_program("plugins/p.qwe", { "../y.qwe": "" }))
print(check_program("plugins/p.qwe", null) | len, check_program("plugins/p.qwe", { "plugins/p.qwe": "" }))
```

```output
["error 1: argument 1 of `len` must be str | list | map | html | null, got int", "error 2: unknown name `nope` (did you mean `now`?)", "warning 3: `upper` hides the builtin `upper`: the program's own is used everywhere, so pick another name"]
2
[{ file: "nope.qwe", line: 0, severity: "error", message: "cannot read file: No such file or directory (os error 2)" }]
[{ file: "plugins/p.qwe", line: 1, severity: "error", message: "path must stay inside the program's folder: ../secret.qwe" }]
err("check_program: path must stay inside the program's folder: ../main.qwe")
err("check_program: path must stay inside the program's folder: ../y.qwe")
3 []
```

### Errors

A path outside the folder is an error value; what the checker finds is never one, it is
the list. A path that is not a string is a runtime error.

```quillo error
print(check_program(1))
```

```output
line 1: `check_program` expects a str as argument 1, got int
```

### Chaining

The path comes first in a pipeline:

```quillo
write_file("plugins/ok.qwe", "print(1)\n")
print(("plugins/ok.qwe" | check_program | len) == 0)
let bad = "plugins/ok.qwe" | check_program({ "plugins/ok.qwe": "print(" })
print(bad | map((d) => d.message))
```

```output
true
["expected an expression, found end of input"]
```

### See also

[run_script](/docs/reference/run_script/), [read_file](/docs/reference/read_file/), [write_file](/docs/reference/write_file/)
