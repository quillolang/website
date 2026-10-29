# stats.multimode
stats.multimode(list | null) -> list
group: Statistics

### What it does

Every most common value in a list, in the order each was first seen, as Python's
`statistics.multimode`. The values can be anything, not only numbers. Where
[stats.mode](/docs/reference/stats.mode/) picks the first of a tie, this gives the
whole tie.

### Examples

```quillo
print(stats.multimode([1, 1, 2, 2, 3]))
print(stats.multimode(["b", "a", "b", "a"]))
print(stats.multimode([1, 2, 2, 3]))
```

```output
[1, 2]
["b", "a"]
[2]
```

### Edge cases

- No value repeated means every value is a mode, in the list's order.
- An empty list, or `null`, gives `[]`, not an error.
- `1` and `1.0` are one value, and so are `0.0` and `-0.0`; the first seen is given.
- Text `"1"` and the number `1` are different values.
- Lists and maps are compared by their contents.

```quillo
print(stats.multimode([3, 1, 2]), stats.multimode([]), stats.multimode(null))
print(stats.multimode([1.0, 1, 2]), stats.multimode([0.0, -0.0]), stats.multimode([1, "1", 1.0, "1"]))
print(stats.multimode([[1, 2], [1, 2], [3]]))
```

```output
[3, 1, 2] [] []
[1.0] [0.0] [1, "1"]
[[1, 2]]
```

### Errors

An argument that is not a list or `null` is a runtime error, not an error value.

```quillo error
print(stats.multimode("aab"))
```

```output
line 1: `stats.multimode` expects a list as argument 1, got str
```

### Chaining

```quillo
let scores = [72, 85, 90, 66, 85, 78]
print(scores | stats.multimode)
print(scores | stats.multimode | len)
```

```output
[85]
1
```

### See also

[stats.mode](/docs/reference/stats.mode/), [unique](/docs/reference/unique/), [count](/docs/reference/count/)
