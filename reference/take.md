# take
take(list | str | null, int) -> list | str
group: Lists

### What it does

The first `n` items of a list, or the first `n` characters of a string, as a new
value. Fewer than `n` gives what there is. `null` counts as an empty list and gives
`[]`.

### Examples

```quillo
print(take([1, 2, 3], 2))
print(take("hello", 2))
print(take(sort([5, 3, 9, 1]), 2))
```

```output
[1, 2]
he
[1, 3]
```

### Edge cases

- `n` at or past the length gives the whole value, not an error.
- `0` or a negative `n` gives `[]` or `""`.
- A string is cut by character, not by byte, so an accented letter is one.
- `take(null, n)` is `[]`.
- `take(xs, n)` is `slice(xs, 0, n)`.

```quillo
print(take([1, 2, 3], 10), take([1, 2], 0), take([1, 2], -1))
print(take("añb", 2), take("hi", 5), take("", 1) == "")
print(take(null, 2), take([1, 2, 3], 2) == slice([1, 2, 3], 0, 2))
```

```output
[1, 2, 3] [] []
añ hi true
[] true
```

### Errors

A first argument that is not a list, a string or `null`, or a count that is not an
int, is a runtime error, not an error value.

```quillo error
print(take(5, 1))
```

```output
line 1: `take` expects a list as argument 1, got int
```

```quillo error
print(take([1, 2], "2"))
```

```output
line 1: `take` expects an int as argument 2, got str
```

### Chaining

In a pipeline the list comes first and the count is the only argument:
`xs | take(n)`. With [drop](/docs/reference/drop/) it pages through a list.

```quillo
print(range(10) | drop(2) | take(3))
print(["pear", "fig", "apple"] | sort_by(len) | reverse | take(2))
print("2026-10-29" | take(4))
```

```output
[2, 3, 4]
["apple", "pear"]
2026
```

### See also

[drop](/docs/reference/drop/), [slice](/docs/reference/slice/), [first](/docs/reference/first/), [range](/docs/reference/range/)
