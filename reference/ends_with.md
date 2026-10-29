# ends_with
ends_with(str, str) -> bool
group: Strings

### What it does

Whether the text ends with a suffix. The comparison is exact: case matters and the
suffix is plain text, not a pattern. For a file extension in any case, lower the text
first.

### Examples

```quillo
print(ends_with("hello", "lo"), ends_with("hello", "LO"))
print(ends_with("photo.png", ".png"), ends_with("photo.PNG", ".png"))
print(ends_with(lower("photo.PNG"), ".png"))
```

```output
true false
true false
true
```

### Edge cases

- Every string ends with `""`, the empty string included.
- A string ends with itself; a suffix longer than the text is `false`.
- Characters, not bytes: an accented letter at the end matches as one character.

```quillo
print(ends_with("hello", ""), ends_with("", ""))
print(ends_with("hello", "hello"), ends_with("hello", "xhello"))
print(ends_with("café", "fé"))
```

```output
true true
true false
true
```

### Errors

An argument that is not a string, on either side, is a runtime error, not an error
value: `null` and numbers are refused. Give a `null` field `?? ""` first.

```quillo error
print(ends_with(null, "a"))
```

```output
line 1: `ends_with` expects a str as argument 1, got null
```

### Chaining

In a pipeline the text comes first and the suffix is the argument:

```quillo
print("x.txt" | ends_with(".txt"))
print(["img.png", "a.jpg", "b.PNG"] | filter((f) => lower(f) | ends_with(".png")))
print(`photos/${uuid()}.jpg` | ends_with(".jpg"))
```

```output
true
["img.png", "b.PNG"]
true
```

### See also

[starts_with](/docs/reference/starts_with/), [contains](/docs/reference/contains/), [lower](/docs/reference/lower/), [slice](/docs/reference/slice/), [re.test](/docs/reference/re.test/)
