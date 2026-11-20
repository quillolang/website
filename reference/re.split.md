# re.split
re.split(str, str, str | null=) -> list
group: Regular expressions

### What it does

The text cut at every match of a pattern, as a list of the pieces between the
matches. The matches themselves are left out. Where the separator is plain text,
[split](/docs/reference/split/) does the same without a pattern. The flags come
last: `"i"`, `"m"`, `"s"`.

### Examples

```quillo
print(re.split("a, b,c ,  d", "\\s*,\\s*"))
print(re.split("a1b22c", "\\d+"))
print(re.split("one\ntwo\r\nthree", "\\r?\\n"))
print(re.split("k1=v1;k2=v2", "[;=]"))
```

```output
["a", "b", "c", "d"]
["a", "b", "c"]
["one", "two", "three"]
["k1", "v1", "k2", "v2"]
```

### Edge cases

- Empty pieces are kept: a match at the start, at the end or twice in a row gives
  `""` there.
- A pattern that matches nothing gives the whole text as the only piece; the empty
  text gives `[""]`.
- Groups in the pattern are not put into the list, unlike JavaScript's `split`.
- The empty pattern cuts between every two characters, with `""` at both ends; a
  pattern that can match the empty text (`a*`) gives empty pieces where it does.
- Characters, not bytes: `"añb"` cut at `ñ` is `["a", "b"]`.
- A search whose work would pass a quarter of a second (a pattern that follows many ways
  at once from each place, as `[ab]*a[ab]{900}c` does on a long text of `a` and `b`) is run
  step by step, counted, and stops after 0.1 s and 0.15 µs a byte of the text, within
  `--max-compute`, and before its work takes 256 MiB or `--max-memory`. The call is then an
  error value, `` `re.split`: the pattern is too costly for this text: ...; repeat less, or
  search a shorter text `` *(since 0.8.9: one search held an instance for seconds to
  minutes, past `--max-compute`)*. Ordinary patterns, a long one on a long text too, answer
  as before.
- A pattern whose searches read on past their match (`[a-z]+X|[a-z]` on a run of
  letters) reads the text once for each match it finds. Once its searches have read the
  text 64 times over and computed for more than 0.25 s plus 4 µs a byte, the call is an
  error value (`` `re.split`: the pattern scans the text too many times: ... ``), and
  `--max-compute` ends the request within 64 searches *(since 0.8.7: 300 KB of text held
  a worker 11 s)*. Each thread keeps 32 MB of compiled patterns, the oldest going first
  *(since 0.8.7: 256 patterns of any size)*.

```quillo
print(re.split(",a,,b,", ","), re.split("x", "x"))
print(re.split("abc", "x"), re.split("", "x"))
print(re.split("a1b", "(\\d)"), re.split("A-b_C", "[-_]", "i"))
print(re.split("ab", ""), re.split("aaa", "a*"))
print(re.split("añb", "ñ"))
```

```output
["", "a", "", "b", ""] ["", ""]
["abc"] [""]
["a", "b"] ["A", "b", "C"]
["", "a", "b", ""] ["", "", ""]
["a", "b"]
```

### Errors

A pattern that is not supported (lookaround, backreferences, `\p{...}`, a bad escape,
a bad flag) is a runtime error, not an error value, as is a text that is not a
string. See [re.test](/docs/reference/re.test/) for what a pattern may hold.

```quillo error
print(re.split("abc", "(?!b)"))
```

```output
line 1: `re.split`: lookahead and lookbehind ((?= (?! (?<= (?<!) are not supported
```

```quillo error
print(re.split(42, ","))
```

```output
line 1: `re.split` expects a str as argument 1, got int
```

### Chaining

The text comes first in a pipeline, and the pieces go on to `map` or `filter`:

```quillo
print("a  b   c" | re.split("\\s+") | map(upper))
print("one, two,,three" | re.split("\\s*,\\s*") | filter((p) => p != ""))
let [key, value] = re.split("name = Ann", "\\s*=\\s*")
print(key, value)
```

```output
["A", "B", "C"]
["one", "two", "three"]
name Ann
```

### See also

[split](/docs/reference/split/), [re.find_all](/docs/reference/re.find_all/), [re.replace](/docs/reference/re.replace/), [join](/docs/reference/join/), [filter](/docs/reference/filter/)
