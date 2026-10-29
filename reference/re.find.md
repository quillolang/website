# re.find
re.find(str, str, str | null=) -> map | null
group: Regular expressions

### What it does

The first match of a pattern in the text, or `null` when there is none. A match is a
map `{ text, start, end, groups, named }`: the matched text, where it is (positions
counting characters, as `slice` does, the end one past the last), the groups as a
list and the named groups as a map. The flags come last: `"i"`, `"m"`, `"s"`.

### Examples

```quillo
print(re.find("order 42 of 7", "\\d+"))
print(re.find("2026-10-29", "(\\d+)-(\\d+)-(\\d+)"))
print(re.find("2026-10-29", "(?<y>\\d+)-(?<m>\\d+)-(?<d>\\d+)"))
print(re.find("hello", "\\d+"))
```

```output
{ text: "42", start: 6, end: 8, groups: [], named: {} }
{ text: "2026-10-29", start: 0, end: 10, groups: ["2026", "10", "29"], named: {} }
{ text: "2026-10-29", start: 0, end: 10, groups: ["2026", "10", "29"], named: { y: "2026", m: "10", d: "29" } }
null
```

### Edge cases

- `groups` has one entry per `(...)` in the pattern, in order, named ones included; a
  group that did not take part is `null`. `(?:...)` makes no group.
- `named` holds only the named groups; it is `{}` when there are none.
- Positions count characters, not bytes: in `"añob"` the `o` starts at 2, and
  `slice(text, start, end)` gives the match back.
- An empty match is a match: `re.find("abc", "")` is at 0, with the empty text.
- Quantifiers are greedy unless followed by `?`.
- `null` as the result reads well with `??`.

```quillo
print(re.find("ab", "a(x)?b"), re.find("ab", "a(?:x)?b"))
print(re.find("x", "(?<n>x)").groups, re.find("x", "x").named)
let m = re.find("añob", "o")
print(m.start, m.end, slice("añob", m.start, m.end))
print(re.find("abc", ""), re.find("aaa", "a+").text, re.find("aaa", "a+?").text)
print(re.find("hello", "\\d+") ?? "none")
```

```output
{ text: "ab", start: 0, end: 2, groups: [null], named: {} } { text: "ab", start: 0, end: 2, groups: [], named: {} }
["x"] {}
2 3 o
{ text: "", start: 0, end: 0, groups: [], named: {} } aaa a
none
```

### Errors

No match is `null`, not an error. A pattern that is not supported (lookaround,
backreferences, `\p{...}`, a bad escape, a bad flag) is a runtime error, not an error
value, as is a text, a pattern or flags that are not strings. See
[re.test](/docs/reference/re.test/) for the list.

```quillo error
print(re.find("abc", "(?=b)"))
```

```output
line 1: `re.find`: lookahead and lookbehind ((?= (?! (?<= (?<!) are not supported
```

```quillo error
print(re.find("abc", "b", 1))
```

```output
line 1: `re.find` expects a str as argument 3, got int
```

### Chaining

The text comes first in a pipeline. The groups can be taken apart with `let [a, b]`:

```quillo
print("Call 555-1234 now" | re.find("\\d{3}-\\d{4}") | get("text"))
let [key, value] = re.find("name=Ann", "(\\w+)=(\\w+)").groups
print(key, value)
print(["v1.2", "beta", "v3.0"] | map((s) => re.find(s, "\\d+\\.\\d+")) | filter((m) => m != null) | map((m) => m.text))
```

```output
555-1234
name Ann
["1.2", "3.0"]
```

### See also

[re.find_all](/docs/reference/re.find_all/), [re.test](/docs/reference/re.test/), [re.replace](/docs/reference/re.replace/), [slice](/docs/reference/slice/), [index_of](/docs/reference/index_of/), [get](/docs/reference/get/)
