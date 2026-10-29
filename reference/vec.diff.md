# vec.diff
vec.diff(list | null) -> list
group: Vectors

### What it does

The difference between each item and the one before it: a list one shorter than the
input, where item `i` is `xs[i + 1] - xs[i]`. Ints stay ints and floats stay floats, as
with `-`.

### Examples

```quillo
print(vec.diff([1, 4, 9, 16]))
print(vec.diff([5, 3, 8]))
print(vec.diff([1.5, 1]))
```

```output
[3, 5, 7]
[-2, 5]
[-0.5]
```

### Edge cases

- The empty list, one item, or `null` gives the empty list.
- A fall gives a negative number; the sign says the direction.
- `vec.diff` undoes `vec.cumsum` from the second item on.

```quillo
print(vec.diff([]), vec.diff([1]), vec.diff(null))
print(vec.diff([10, 7]))
print(vec.diff(vec.cumsum([3, 5, 4])))
```

```output
[] [] []
[-3]
[5, 4]
```

### Errors

An item that is not an int or a float, or an argument that is not a list, is a runtime
error, not an error value. A decimal is not accepted; convert with `float`.

```quillo error
print(vec.diff([1, "a"]))
```

```output
line 1: `vec.diff` expects numbers, got str and int
```

### Chaining

The day-to-day change of a series, and its largest jump:

```quillo
let sales = [3, 5, 4, 6, 8]
print(sales | vec.diff)
print(sales | vec.diff | vec.abs | max)
```

```output
[2, -1, 2, 2]
2
```

### See also

[vec.cumsum](/docs/reference/vec.cumsum/), [vec.sub](/docs/reference/vec.sub/), [vec.abs](/docs/reference/vec.abs/), [vec.rolling_mean](/docs/reference/vec.rolling_mean/)
