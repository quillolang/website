# len
len(str | list | map | html | null) -> int
group: General

### What it does

The size of a value: a string's characters, a list's items, a map's keys, and an
`html` value's bytes. `null` has length 0, so a missing list or text counts as empty.
`x.len` is the same as `len(x)`.

### Examples

```quillo
print(len("hello"), len([1, 2, 3]), len({ a: 1, b: 2 }))
print(len(""), len([]), len({}))
```

```output
5 3 2
0 0 0
```

### Edge cases

- Characters, not bytes: `len("é")` and `len("😀")` are 1.
- `null` is 0, not an error.
- A list counts its items only, not what is inside them: `[[1, 2], [3]]` has length 2.
- An `html` value's length is its bytes, as sent to the browser.
- Splitting the empty string gives one empty piece, so its length is 1, not 0.

```quillo
print(len("é"), len("😀"), len("héllo"), len("a\nb"))
print(len(null), len([[1, 2], [3]]))
print(len(<b>hi</b>))
print(len(split("", ",")))
```

```output
1 1 5 3
0 2
9
1
```

### Errors

A number, a boolean or a function has no length: that is a runtime error, not an error
value. Convert a number with `str` first.

```quillo error
print(len(42))
```

```output
line 1: `len` expects a str, list or map, got int
```

### Chaining

```quillo
print(123 | str | len)
print("a,b,c" | split(",") | len)
print(["ab", "", "c"] | filter((s) => len(s) > 0) | len)
```

```output
3
3
2
```

### See also

[slice](/docs/reference/slice/), [split](/docs/reference/split/), [count](/docs/reference/count/), [str](/docs/reference/str/), [contains](/docs/reference/contains/)
