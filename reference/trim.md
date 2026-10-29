# trim
trim(str) -> str
group: Strings

### What it does

The text without the whitespace at its start and end: spaces, tabs, newlines and
carriage returns, and the Unicode spaces as well. Whitespace inside the text stays.

### Examples

```quillo
print(trim("  hi  "))
print(trim("\t\nhi\r\n") == "hi")
print(trim(" a b "))
```

```output
hi
true
a b
```

### Edge cases

- The empty string, and a string of only whitespace, give the empty string.
- Inner runs of spaces are kept: `trim` is not a squeeze.
- A no-break space and an em space are whitespace too, and trimmed.
- Only whitespace: a dash or a quote at the edge stays.

```quillo
print(trim(""), trim("   "), len(trim("   ")))
print(trim("  inner  spaces  "))
print(trim(" hi ") | len, trim("  x  "))
print(trim("- x -"))
```

```output
  0
inner  spaces
2 x
- x -
```

### Errors

An argument that is not a string, `null` included, is a runtime error, not an error
value. A field that may be `null` gets `?? ""` first.

```quillo error
print(trim(null))
```

```output
line 1: `trim` expects a str as argument 1, got null
```

```quillo
let note = null
print(trim(note ?? "") == "")
```

```output
true
```

### Chaining

```quillo
print("  Hi  " | trim | lower)
print(" a , b " | split(",") | map(trim))
print(("   " | trim | len) == 0)
```

```output
hi
["a", "b"]
true
```

### See also

[split](/docs/reference/split/), [lower](/docs/reference/lower/), [upper](/docs/reference/upper/), [replace](/docs/reference/replace/), [len](/docs/reference/len/)
