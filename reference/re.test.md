# re.test
re.test(str, str, str | null=) -> bool
group: Regular expressions

### What it does

Whether a pattern matches anywhere in the text: `true` or `false`, nothing about
where. The pattern is a string (in a string a backslash is written twice: `"\\d+"`),
and the flags come last: `"i"` for any case, `"m"` for `^` and `$` at each line, `"s"`
for `.` matching line breaks too. Patterns take only what the server and the browser
read alike, so a component gets the same answer.

### Examples

```quillo
print(re.test("order 42", "\\d+"), re.test("order", "\\d+"))
print(re.test("Hello", "^hello$"), re.test("Hello", "^hello$", "i"))
print(re.test("ann@example.com", "^[\\w.]+@[\\w.]+\\.\\w+$"))
```

```output
true false
false true
true
```

### Edge cases

- Without `"m"`, `^` and `$` are the ends of the whole text; without `"s"`, `.` does not
  match a line break. The flags combine: `"ims"`.
- The empty pattern matches any text, the empty text included; `^$` matches only the
  empty text.
- `\d`, `\w` and `\b` are ASCII, as in JavaScript: `ñ` is not a `\w` and `٣` is not a
  `\d`. `.` and `[...]` match any character, `ñ` as one.
- `null` as the flags is the same as none.

```quillo
print(re.test("a\nb", "^b$"), re.test("a\nb", "^b$", "m"), re.test("a\nb", "a.b"), re.test("a\nb", "a.b", "s"))
print(re.test("", ""), re.test("abc", ""), re.test("", "^$"), re.test("abc", "^$"))
print(re.test("añ", "^\\w+$"), re.test("٣", "\\d"), re.test("año", "a.o"))
print(re.test("abc", "b", null))
```

```output
false true false true
true true true false
false false true
true
```

### Errors

A pattern that is not supported is a runtime error, not an error value, and
`quillo check` reports it before the program runs when the pattern is written in the
call: lookahead and lookbehind, backreferences (`\1`, `\k<name>`), `\p{...}`, an
escape of a character that needs none (`\,`), a count over 1,000, an unbalanced
parenthesis, a flag that is not `i`, `m` or `s`, or one given twice. A text or a
pattern that is not a string is a runtime error too.

```quillo error
print(re.test("abc", "(?<=a)b"))
```

```output
line 1: `re.test`: lookahead and lookbehind ((?= (?! (?<= (?<!) are not supported
```

```quillo error
print(re.test("abab", "(ab)\\1"))
```

```output
line 1: `re.test`: backreferences (\1, \k<name>) are not supported
```

```quillo error
print(re.test("abc", "b", "x"))
```

```output
line 1: `re.test`: the flags are `i` (any case), `m` (^ and $ at each line) and `s` (. matches line breaks), each once; got "x"
```

### Chaining

In a pipeline the text comes first, so `re.test` reads as a predicate; with `filter` it
keeps the lines that match:

```quillo
print("2026-10-29" | re.test("^\\d{4}-\\d{2}-\\d{2}$"))
print(["ann@x.io", "bob", "cy@y.org"] | filter((s) => re.test(s, "@")))
```

```output
true
["ann@x.io", "cy@y.org"]
```

### See also

[re.find](/docs/reference/re.find/), [re.find_all](/docs/reference/re.find_all/), [re.replace](/docs/reference/re.replace/), [re.split](/docs/reference/re.split/), [contains](/docs/reference/contains/), [starts_with](/docs/reference/starts_with/)
