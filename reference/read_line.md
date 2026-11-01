# read_line
read_line() -> str | null | error(str)
group: Files and processes

### What it does

The next line a script is given, without its line break, or `null` at the end of what is
piped in. A loop of `read_line()` reads a file of any size a line at a time.

### Examples

```quillo noexec
// quillo run upper.qwe < notes.txt
let line = read_line()
while line != null {
    print(upper(line))
    line = read_line()
}
```

### Edge cases

- A `\r\n` ending is taken off as `\n` is; an empty line is `""`, not `null`.
- The last line counts with or without a line break after it.
- From a terminal it waits for a line to be typed.

### Errors

As [stdin](/docs/reference/stdin/), it is for a script: in a program that serves it is a
runtime error.

### Chaining

None: it takes nothing.

### See also

[stdin](/docs/reference/stdin/), [exit](/docs/reference/exit/), [args](/docs/reference/args/)
