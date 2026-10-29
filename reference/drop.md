# drop
drop(list | str | null, int) -> list | str
group: Lists

### What it does

The list without its first `n` items, or the string without its first `n` characters,
as a new value. Dropping more than there is gives an empty one. `null` counts as an
empty list and gives `[]`.

### Examples

```quillo
print(drop([1, 2, 3], 2))
print(drop("hello", 2))
print(drop(["header", "row 1", "row 2"], 1))
```

```output
[3]
llo
["row 1", "row 2"]
```

### Edge cases

- `n` at or past the length gives `[]` or `""`, not an error.
- `0` or a negative `n` gives the whole value.
- A string is cut by character, not by byte.
- `drop(null, n)` is `[]`.
- `drop(xs, n)` is `slice(xs, n)`.

```quillo
print(drop([1, 2, 3], 10), drop([1, 2], 0), drop([1, 2], -1))
print(drop("añb", 2), drop("hi", 5) == "", drop("", 1) == "")
print(drop(null, 2), drop([1, 2, 3], 1) == slice([1, 2, 3], 1))
```

```output
[] [1, 2] [1, 2]
b true true
[] true
```

### Errors

A first argument that is not a list, a string or `null`, or a count that is not an
int, is a runtime error, not an error value. The count is required.

```quillo error
print(drop({ a: 1 }, 1))
```

```output
line 1: `drop` expects a list as argument 1, got map
```

```quillo error
print(drop([1, 2]))
```

```output
line 1: `drop` expects an int as argument 2, got nothing
```

### Chaining

In a pipeline the list comes first and the count is the only argument:
`xs | drop(n)`. With [take](/docs/reference/take/) it pages through a list; after a
sort it skips the smallest.

```quillo
let page = 2
let size = 3
print(range(10) | drop((page - 1) * size) | take(size))
print([5, 3, 9, 1] | sort | drop(1))
print("id-42" | drop(3) | int)
```

```output
[3, 4, 5]
[3, 5, 9]
42
```

### See also

[take](/docs/reference/take/), [slice](/docs/reference/slice/), [last](/docs/reference/last/), [first](/docs/reference/first/)
