# normalize
normalize(str, str | null=) -> str
group: Strings

### What it does

The text in one Unicode form, so that text which looks the same is the same. `é` can be
written as one character or as `e` followed by a combining accent; a keyboard on one
system and a paste from another can give either, and `==`, `len` and a database's unique
index tell them apart. `normalize(s)` writes the composed form, NFC; the second argument
picks another: `"NFD"` (decomposed), `"NFKC"` or `"NFKD"`, which also fold look-alikes
such as `ﬁ` into `fi`. It runs the same on the server and in the browser.

### Examples

```quillo
let typed = "café"
let pasted = "cafe\u{301}"
print(typed == pasted, normalize(typed) == normalize(pasted))
print(len(pasted), len(normalize(pasted)), len(normalize(typed, "NFD")))
```

```output
false true
5 4 5
```

### Edge cases

- Compare user names and emails after `normalize(lower(trim(s)), "NFKC")`, and keep them
  so in the database, so two accounts cannot share one visible name.
- The form's name may be in either case. Text already in the form comes back the same,
  and an empty text is empty.

```quillo
print(normalize("ﬁle", "nfkc"), normalize("ﬁle"), normalize("Ⅻ", "NFKD"), normalize(""))
```

```output
file ﬁle XII 
```

### Errors

A form that is none of the four is a runtime error.

```quillo error
normalize("x", "NFX")
```

```output
line 1: `normalize`: the form is "NFC", "NFD", "NFKC" or "NFKD", got "NFX"
```

### Chaining

```quillo
print("  Cafe\u{301}  " | trim() | normalize() | lower())
```

```output
café
```

### See also

[lower](/docs/reference/lower/), [trim](/docs/reference/trim/), [len](/docs/reference/len/)
