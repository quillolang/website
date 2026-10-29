# lower
lower(str) -> str
group: Strings

### What it does

The text in lower case. It knows all of Unicode, so letters outside ASCII are converted
too: Greek, Cyrillic and accented letters alike. Digits, punctuation and whitespace stay
as they are.

### Examples

```quillo
print(lower("HELLO"))
print(lower("ÆRØ 42, OK?"))
print(lower("ΑΒΓ"), lower("Straße"))
```

```output
hello
ærø 42, ok?
αβγ straße
```

### Edge cases

- The empty string gives the empty string.
- The result can be longer than the text: a Turkish dotted `İ` becomes `i` with a
  combining dot, two characters.
- A final Greek sigma lowers to `ς`, not `σ`: the rule is positional.
- `upper` and `lower` do not always round-trip: `upper("ß")` is `SS`, which lowers to
  `ss`. For a case-insensitive comparison, lower both sides.

```quillo
print(lower(""), len(lower("İ")))
print(lower("ΣΑΣ"))
print(upper("ß") | lower)
print(lower("Ab") == lower("aB"))
```

```output
 2
σας
ss
true
```

### Errors

An argument that is not a string is a runtime error, not an error value: `lower(42)`
stops the request. Convert first with `str`.

```quillo error
print(lower(42))
```

```output
line 1: `lower` expects a str as argument 1, got int
```

### Chaining

In a pipeline the text comes first, so `lower` takes it as its only argument:

```quillo
print("  Mixed Case  " | trim | lower)
print(["Ann", "BOB"] | map(lower))
print(["img.png", "a.jpg", "b.PNG"] | filter((f) => lower(f) | ends_with(".png")))
```

```output
mixed case
["ann", "bob"]
["img.png", "b.PNG"]
```

### See also

[upper](/docs/reference/upper/), [trim](/docs/reference/trim/), [str](/docs/reference/str/)
