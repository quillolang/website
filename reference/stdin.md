# stdin
stdin() -> str | error(str)
group: Files and processes

### What it does

All that is piped to a script, as text, read to the end: `cat rows.csv | quillo run
tool.qwe`. Nothing piped is `""`. With [read_line](/docs/reference/read_line/) a script
reads a line at a time instead, and [exit](/docs/reference/exit/) ends it with a status,
which makes it a command-line tool.

### Examples

```quillo noexec
// cat words.txt | quillo run count.qwe
let words = split(trim(lower(stdin())), " ")
print(len(words))
```

### Edge cases

- Bytes that are not UTF-8 are replaced, as `read_file` replaces them.
- From a terminal with nothing piped, it waits for what is typed, to the end (Ctrl-D).
- Once read, it is read: a second `stdin()` gives `""`.
- A top-level value made from it is kept out of the browser's bundle, as one made from
  [env](/docs/reference/env/) is: a component that reads it is refused when the program
  loads *(since 0.8.9: it went into the public JavaScript)*.

### Errors

A program that serves is not a script: there, it is a runtime error, as the input is the
terminal's and a request is not the one to read it.

```quillo noexec
route GET /x = stdin()    // a 500: `stdin` is for a script
```

### Chaining

`stdin() | split("\n")` gives its lines.

### See also

[read_line](/docs/reference/read_line/), [exit](/docs/reference/exit/), [args](/docs/reference/args/), [read_file](/docs/reference/read_file/)
