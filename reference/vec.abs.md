# vec.abs
vec.abs(list) -> list
group: Vectors

### What it does

Each item's absolute value: negatives turned positive, the rest as they are. A list of
only ints gives ints; a list with a float in it gives floats throughout.

### Examples

```quillo
print(vec.abs([-1, 2, -3]))
print(vec.abs([-1.5, 2.5]))
```

```output
[1, 2, 3]
[1.5, 2.5]
```

### Edge cases

- One float makes the whole result floats: `vec.abs([-1, 2.5])` is `[1.0, 2.5]`.
- The empty list, or `null`, gives the empty list.
- `-0.0` becomes `0.0`; `-inf` becomes `inf`; `NaN` stays `NaN`.

```quillo
print(vec.abs([-1, 2.5]))
print(vec.abs([]), vec.abs(null))
print(vec.abs([-0.0, -math.inf]))
```

```output
[1.0, 2.5]
[] []
[0.0, inf]
```

### Errors

An item that is not an int or a float, or an argument that is not a list, is a runtime
error, not an error value.

```quillo error
print(vec.abs([1, "a"]))
```

```output
line 1: `vec.abs` expects a list of numbers, but item 1 is str
```

### Chaining

The size of each change, whichever way it went, and the mean absolute deviation:

```quillo
let sales = [3, 5, 4, 6, 8]
print(sales | vec.diff | vec.abs)
print(sales | vec.sub(stats.mean(sales)) | vec.abs | stats.mean)
```

```output
[2, 1, 2, 2]
1.44
```

### See also

[abs](/docs/reference/abs/), [vec.sub](/docs/reference/vec.sub/), [vec.diff](/docs/reference/vec.diff/), [vec.norm](/docs/reference/vec.norm/), [math.fabs](/docs/reference/math.fabs/)
