# replace
replace(str, str, str) -> str
group: Strings

### What it does

The text with every occurrence of one piece replaced by another. The piece is plain
text, not a pattern, and all of them are replaced, left to right, without overlapping;
for a pattern use [re.replace](/docs/reference/re.replace/).

### Examples

```quillo
print(replace("a-b-c", "-", "+"))
print(replace("hello world", "world", "there"))
print(replace("a.b.c", ".", ""))
```

```output
a+b+c
hello there
abc
```

### Edge cases

- A piece that is not in the text leaves it unchanged; case matters.
- Matches do not overlap: in `"aaa"`, `"aa"` is found once, and the result can be
  longer than the text, since each `"a"` can become `"aa"`.
- The empty piece matches between every character and at both ends, so
  `replace("hello", "", "-")` is `-h-e-l-l-o-`.
- Replacing the whole text with `""` gives the empty string, and the empty text stays
  empty.

```quillo
print(replace("hello", "x", "y"), replace("Hello", "h", "j"))
print(replace("aaa", "aa", "b"), replace("aaa", "a", "aa"))
print(replace("hello", "", "-"))
print(replace("abc", "abc", ""), replace("", "a", "b"), replace("héllo", "é", "e"))
```

```output
hello Hello
ba aaaaaa
-h-e-l-l-o-
  hello
```

### Errors

All three arguments are needed and must be strings; anything else is a runtime error,
not an error value. A number to put in is converted with `str` first.

```quillo error
print(replace("abc", "a"))
```

```output
line 1: `replace` expects a str as argument 3, got nothing
```

### Chaining

In a pipeline the text comes first, then the piece and its replacement:

```quillo
print("hello world" | replace("world", "there") | upper)
print(uuid() | replace("-", "") | len)
print(["a_b", "c_d"] | map((s) => replace(s, "_", " ")))
```

```output
HELLO THERE
32
["a b", "c d"]
```

### See also

[re.replace](/docs/reference/re.replace/), [split](/docs/reference/split/), [join](/docs/reference/join/), [trim](/docs/reference/trim/), [contains](/docs/reference/contains/)
