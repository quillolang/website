# vec.round
vec.round(list, int=) -> list
group: Vectors

### What it does

Each item rounded. Without `digits` the result is a list of ints, rounded to the nearest
whole number with halves away from zero. With `digits` the result is a list of floats
rounded to that many decimal places, as `round(x, digits)` does.

### Examples

```quillo
print(vec.round([1.4, 1.5, 2.5, -1.5]))
print(vec.round([1.2345, 2.5], 2))
```

```output
[1, 2, 3, -2]
[1.23, 2.5]
```

### Edge cases

- Halves round away from zero: `2.5` to `3`, `-1.5` to `-2`.
- Ints with `digits` become floats: `vec.round([1, 2], 1)` is `[1.0, 2.0]`; without,
  they stay ints.
- `digits` of 0 gives whole numbers as floats, not ints.
- A negative `digits` does not round to tens: it is treated as 0.
- `digits` past 15 is treated as 15.
- `inf` and `NaN` stay as they are; a float too large for an int stays a float.
- The empty list, or `null`, gives the empty list.

```quillo
print(vec.round([1, 2]), vec.round([1, 2], 1), vec.round([1.5], 0))
print(vec.round([1234.5], -1))
print(vec.round([0.1 + 0.2], 20))
print(vec.round([math.inf, float("nan")]))
print(vec.round([]), vec.round(null))
```

```output
[1, 2] [1.0, 2.0] [2.0]
[1235.0]
[0.3]
[inf, NaN]
[] []
```

### Errors

An item that is not an int or a float, a `digits` that is not an int, or a first
argument that is not a list are runtime errors, not error values.

```quillo error
print(vec.round([1.5], "2"))
```

```output
line 1: `vec.round` expects an int as argument 2, got str
```

### Chaining

`vec.round` usually ends a pipeline, after the arithmetic:

```quillo
let sales = [3, 5, 4, 6, 8]
print(sales | vec.div(sum(sales)) | vec.mul(100) | vec.round(1))
print(vec.linspace(0, 1, 5) | vec.mul(100) | vec.round)
```

```output
[11.5, 19.2, 15.4, 23.1, 30.8]
[0, 25, 50, 75, 100]
```

### See also

[round](/docs/reference/round/), [vec.clip](/docs/reference/vec.clip/), [vec.div](/docs/reference/vec.div/), [int](/docs/reference/int/)
