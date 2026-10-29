# split
split(str, str=) -> list
group: Strings

### What it does

Cuts text at every occurrence of a separator and gives the pieces as a list of
strings. The separator is plain text, not a pattern; for a pattern use
[re.split](/docs/reference/re.split/). Without a separator, the text is split at
spaces; with the empty separator, into its characters.

### Examples

```quillo
print(split("a,b,c", ","))
print(split("2026-10-29", "-"))
print(split("one  two", " "))
print(split("a b c"), split("abc", ""))
```

```output
["a", "b", "c"]
["2026", "10", "29"]
["one", "", "two"]
["a", "b", "c"] ["a", "b", "c"]
```

### Edge cases

- Empty pieces are kept: a separator at the start, at the end or twice in a row gives
  `""` there. Filter them out when they do not matter.
- Splitting the empty string gives `[""]`, a list with one empty piece, not `[]`.
- A separator that is not in the text gives the whole text as the only piece.
- Characters, not bytes: `split("añb", "")` gives three pieces.

```quillo
print(split(",a,,b,", ","))
print(split(",a,,b,", ",") | filter((p) => p != ""))
print(split("", ","), split("abc", ","))
print(split("añb", ""))
```

```output
["", "a", "", "b", ""]
["a", "b"]
[""] ["abc"]
["a", "ñ", "b"]
```

### Errors

A text or a separator that is not a string is a runtime error, not an error value.

```quillo error
print(split(42, ","))
```

```output
line 1: `split` expects a str as argument 1, got int
```

### Chaining

```quillo
print("k=v" | split("=") | first)
print("a b c" | split(" ") | map(upper) | join("-"))
let [key, value] = split("name=Ann", "=")
print(key, value)
```

```output
k
A-B-C
name Ann
```

### See also

[join](/docs/reference/join/), [re.split](/docs/reference/re.split/), [trim](/docs/reference/trim/), [slice](/docs/reference/slice/)
