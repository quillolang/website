# re.find_all
re.find_all(str, str, str | null=) -> list
group: Regular expressions

### What it does

Every match of a pattern in the text, from left to right, as a list of matches, each
`{ text, start, end, groups, named }` as [re.find](/docs/reference/re.find/) gives it.
No match is the empty list. The flags come last: `"i"`, `"m"`, `"s"`.

### Examples

```quillo
print(re.find_all("a1 b22 c333", "\\d+") | map((m) => m.text))
print(re.find_all("@ann and @bob", "@(\\w+)") | map((m) => m.groups[0]))
print(re.find_all("x1y2", "(?<l>[a-z])(?<n>\\d)") | map((m) => m.named))
print(re.find_all("hello", "\\d+"))
```

```output
["1", "22", "333"]
["ann", "bob"]
[{ l: "x", n: "1" }, { l: "y", n: "2" }]
[]
```

### Edge cases

- Matches do not overlap: `"aa"` in `"aaa"` is found once, at 0.
- After an empty match the search goes on one character later, as JavaScript's
  `matchAll` does, so the empty pattern matches at every position, the end included.
- Positions count characters, not bytes, and `start`/`end` of each match are
  positions in the whole text.
- With `"m"`, `^` and `$` match at each line.

```quillo
print(re.find_all("aaa", "aa") | map((m) => [m.start, m.end]))
print(re.find_all("abc", "") | map((m) => m.start))
print(re.find_all("añob", "[ob]") | map((m) => [m.start, m.end]))
print(re.find_all("a\nb\nc", "^\\w$", "m") | map((m) => m.text))
```

```output
[[0, 2]]
[0, 1, 2, 3]
[[2, 3], [3, 4]]
["a", "b", "c"]
```

### Errors

No match is `[]`, not an error. A pattern that is not supported (lookaround,
backreferences, `\p{...}`, a bad escape, a bad flag) is a runtime error, not an error
value, as is a text that is not a string: `null` from a missing field stops the
request, so give it a default first. See [re.test](/docs/reference/re.test/) for the
list.

```quillo error
print(re.find_all(null, "\\w+"))
```

```output
line 1: `re.find_all` expects a str as argument 1, got null
```

```quillo error
print(re.find_all("abc", "\\p{L}"))
```

```output
line 1: `re.find_all`: Unicode classes (\p{...}) are not supported
```

### Chaining

The text comes first in a pipeline, and the list goes on to `map`, `len` or `join`:

```quillo
print("tags: #a #b #c" | re.find_all("#(\\w+)") | map((m) => m.groups[0]) | join(", "))
print("a-b-c" | re.find_all("-") | len)
print("The year 1999 and 2026" | re.find_all("\\d{4}") | map((m) => int(m.text)) | sum)
```

```output
a, b, c
2
4025
```

### See also

[re.find](/docs/reference/re.find/), [re.test](/docs/reference/re.test/), [re.replace](/docs/reference/re.replace/), [re.split](/docs/reference/re.split/), [map](/docs/reference/map/)
