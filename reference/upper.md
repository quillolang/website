# upper
upper(str) -> str
group: Strings

### What it does

The text in upper case. It knows all of Unicode, so letters outside ASCII are
converted too, and a letter that grows when capitalised does: `"ß"` becomes `"SS"`.
Digits, punctuation and whitespace stay as they are.

### Examples

```quillo
print(upper("hello"))
print(upper("straße"))
print(upper("Ærøskøbing 42, ok?"))
```

```output
HELLO
STRASSE
ÆRØSKØBING 42, OK?
```

### Edge cases

- The empty string gives the empty string.
- The result can be longer than the text: `"ß"` is one character, `"SS"` two.
- Case is not folded for comparing: `upper(a) == upper(b)` is a fine equality test for
  ASCII, but for text in any language compare with `lower` as well, since some letters
  only round-trip one way.

```quillo
print(upper(""), len(upper("ß")))
print(upper("ﬁ") == "FI")
```

```output
 2
true
```

### Errors

An argument that is not a string is a runtime error, not an error value: `upper(42)`
stops the request. Convert first with `str`.

```quillo error
print(upper(42))
```

```output
line 1: `upper` expects a str as argument 1, got int
```

### Chaining

In a pipeline the text comes first, so `upper` takes it as its only argument:

```quillo
print("  mixed Case  " | trim | upper)
print(["ann", "bob"] | map(upper))
```

```output
MIXED CASE
["ANN", "BOB"]
```

### See also

[lower](/docs/reference/lower/), [trim](/docs/reference/trim/), [str](/docs/reference/str/)
