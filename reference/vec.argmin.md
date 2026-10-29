# vec.argmin
vec.argmin(list | null) -> int | null
group: Vectors

### What it does

The position of the smallest number in a list, counting from 0. When several items tie,
the first one wins. The empty list has no smallest item and gives `null`.

### Examples

```quillo
print(vec.argmin([3, 1, 2]))
let prices = [9.5, 7.25, 8]
print(prices[vec.argmin(prices)])
```

```output
1
7.25
```

### Edge cases

- Ties go to the first: `vec.argmin([1, 1, 2])` is `0`.
- The empty list, or `null`, gives `null`.
- `NaN` is skipped; a list of only `NaN` gives `null`.
- Ints and floats mix; `-inf` is the smallest of all.

```quillo
print(vec.argmin([1, 1, 2]), vec.argmin([5]))
print(vec.argmin([]), vec.argmin(null))
print(vec.argmin([float("nan"), 2, 1]), vec.argmin([float("nan")]))
print(vec.argmin([1, -math.inf, 2.5]))
```

```output
0 0
null null
2 null
1
```

### Errors

An item that is not an int or a float, or an argument that is not a list, is a runtime
error, not an error value.

```quillo error
print(vec.argmin(["a", "b"]))
```

```output
line 1: `vec.argmin` expects a list of numbers, but item 0 is str
```

### Chaining

The index picks the matching item out of another list, such as the name that goes with
the lowest price:

```quillo
let names = ["ann", "bob", "cy"]
let prices = [9.5, 7.25, 8]
print(names[vec.argmin(prices)])
print(prices | vec.argmin)
```

```output
bob
1
```

### See also

[vec.argmax](/docs/reference/vec.argmax/), [vec.argsort](/docs/reference/vec.argsort/), [min](/docs/reference/min/), [index_of](/docs/reference/index_of/)
