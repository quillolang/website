# args
args() -> list
group: General

### What it does

What followed `--` on the command line, as a list of text, for a script:
`quillo run tool.qwe -- a b` gives `["a", "b"]`. Options of `quillo run` go before the `--`.
With none, it is an empty list.

### Examples

```quillo
print(args())
```

```output
[]
```

### See also

[stdin](/docs/reference/stdin/), [read_line](/docs/reference/read_line/), [exit](/docs/reference/exit/), [read_file](/docs/reference/read_file/)
