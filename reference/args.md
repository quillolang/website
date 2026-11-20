# args
args() -> list
group: General

### What it does

What followed `--` on the command line, as a list of text, for a script:
`quillo run tool.qwe -- a b` gives `["a", "b"]`. Options of `quillo run` go before the `--`.
With none, it is an empty list. A top-level value made from it is kept out of the
browser's bundle, as one made from [env](/docs/reference/env/) is: a component that reads
it is refused when the program loads *(since 0.8.9)*.

### Examples

```quillo
print(args())
```

```output
[]
```

### See also

[stdin](/docs/reference/stdin/), [read_line](/docs/reference/read_line/), [exit](/docs/reference/exit/), [read_file](/docs/reference/read_file/)
