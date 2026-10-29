# join
join(list | null, str=) -> str
group: Strings

### What it does

The items of a list as one string, with a separator between them; without a separator
they are put side by side. Each item is written as `str` writes it, so numbers,
booleans and `null` join as their text and need no converting first. `null` as the
list joins as the empty string.

### Examples

```quillo
print(join(["a", "b", "c"], ", "))
print(join(["a", "b"]))
print(join([1, 2.5, true, null], "|"))
```

```output
a, b, c
ab
1|2.5|true|null
```

### Edge cases

- The empty list, and `null`, give the empty string.
- One item gives that item, with no separator.
- A list or a map inside is written as Quillo writes it, strings quoted.
- A decimal keeps its digits; the separator can be any string, a newline included.

```quillo
print(join([], ","), join(null, ","), join(["only"], ", "))
print(join([[1, "x"], { a: 1 }], " "))
print(join([dec("1.50"), 2], "+"))
print(join(["x", "y"], "\n"))
```

```output
  only
[1, "x"] { a: 1 }
1.50+2
x
y
```

### Errors

A first argument that is not a list or `null`, or a separator that is not a string, is
a runtime error, not an error value. Text is split first with `split`.

```quillo error
print(join("abc", ","))
```

```output
line 1: `join` expects a list as argument 1, got str
```

### Chaining

In a pipeline the list comes first and the separator is the argument:

```quillo
print("a b c" | split(" ") | map(upper) | join("-"))
print(["b", "a"] | sort | join(", "))
print([1, 2, 3] | map((n) => n * n) | join(" "))
```

```output
A-B-C
a, b
1 4 9
```

### See also

[split](/docs/reference/split/), [str](/docs/reference/str/), [map](/docs/reference/map/), [repeat](/docs/reference/repeat/)
