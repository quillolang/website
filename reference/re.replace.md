# re.replace
re.replace(str, str, str | fn, str | null=) -> str
group: Regular expressions

### What it does

The text with every match of a pattern replaced. What goes in is text, where `$1` to
`$9` stand for the groups, `$<name>` for a named group, `$0` for the whole match and
`$$` for a dollar sign; or a function, called with each match (the map
[re.find](/docs/reference/re.find/) gives) and whose result is put in as text. The
flags come last: `"i"`, `"m"`, `"s"`. For plain text that is not a pattern,
[replace](/docs/reference/replace/) is simpler.

### Examples

```quillo
print(re.replace("a1b22c", "\\d+", "#"))
print(re.replace("2026-10-29", "(\\d+)-(\\d+)-(\\d+)", "$3/$2/$1"))
print(re.replace("2026-10-29", "(?<y>\\d+)-(?<m>\\d+)-(?<d>\\d+)", "$<d>.$<m>.$<y>"))
print(re.replace("hello world", "\\w+", (m) => upper(m.text)))
print(re.replace("x=1, y=2", "(\\w)=(\\d)", (m) => `${m.groups[1]}=${m.groups[0]}`))
```

```output
a#b#c
29/10/2026
29.10.2026
HELLO WORLD
1=x, 2=y
```

### Edge cases

- No match leaves the text as it is.
- A `$` followed by anything else stays a `$`: `"$x"` and a `$` at the end go in as
  written. `$$` is the way to write one before a digit.
- A group that did not take part puts in nothing.
- The function's result is written as `print` would write it: an int as its digits,
  `null` as `null`, a list as a list. Give it text.
- An empty match is replaced too: an empty pattern puts the replacement between every
  two characters and at both ends, as JavaScript does.
- Positions in the match given to the function count characters.

```quillo
print(re.replace("hello", "\\d+", "#"), re.replace("price 5", "\\d+", "[$0]"), re.replace("price 5", "\\d+", "$$$0"))
print(re.replace("a b", " ", "$x"), re.replace("a b", " ", "$"), re.replace("ab", "a(x)?b", "[$1]"))
print(re.replace("a1", "\\d", (m) => 42), re.replace("a1", "\\d", (m) => null))
print(re.replace("hello", "", "-"), re.replace("abc", "x*", "-"))
print(re.replace("añob", "o", (m) => str(m.start)), re.replace("Hello", "h", "J", "i"))
```

```output
hello price [5] price $5
a$xb a$b []
a42 anull
-h-e-l-l-o- -a-b-c-
añ2b Jello
```

### Errors

Replacement text that names a group the pattern does not have (`$2` with one group,
`$<y>` with no group `y`, `$<` without its `>`) is a runtime error, not an error
value; so is a replacement that is neither text nor a function (`null`, a number), a
pattern that is not supported, or bad flags. See [re.test](/docs/reference/re.test/)
for what a pattern may hold.

```quillo error
print(re.replace("abc", "(b)", "$2"))
```

```output
line 1: `re.replace`: `$2`, but the pattern has 1 group
```

```quillo error
print(re.replace("abc", "b", null))
```

```output
line 1: `re.replace` expects what to put in (a str or a function) as argument 3, got null
```

### Chaining

The text comes first in a pipeline, so `re.replace` sits between other string
functions:

```quillo
print("  a   b  " | trim | re.replace("\\s+", " "))
print("tel: 555-1234" | re.replace("(\\d{3})-(\\d{4})", "$1 $2") | upper)
print(["a1", "b22"] | map((s) => re.replace(s, "\\d+", "")))
```

```output
a b
TEL: 555 1234
["a", "b"]
```

### See also

[replace](/docs/reference/replace/), [re.find](/docs/reference/re.find/), [re.find_all](/docs/reference/re.find_all/), [re.split](/docs/reference/re.split/), [upper](/docs/reference/upper/), [trim](/docs/reference/trim/)
