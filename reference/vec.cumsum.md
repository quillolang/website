# vec.cumsum
vec.cumsum(list | null) -> list
group: Vectors

### What it does

The running total: a list where each item is the sum of the input up to and including
that position. The last item is the sum of the whole list. Ints stay ints, floats stay
floats, as with `+`.

### Examples

```quillo
print(vec.cumsum([1, 2, 3, 4]))
print(vec.cumsum([0.5, 0.25, 0.25]))
print(vec.cumsum([1, -3, 2]))
```

```output
[1, 3, 6, 10]
[0.5, 0.75, 1.0]
[1, -2, 0]
```

### Edge cases

- The empty list, or `null`, gives the empty list; one item gives itself.
- The totals are plain float additions, so they carry float rounding: `[0.1, 0.2, 0.3]`
  sums to `0.6000000000000001`, unlike `sum`, which is compensated.
- A mixed list turns to floats from the first float on.

```quillo
print(vec.cumsum([]), vec.cumsum(null), vec.cumsum([7]))
print(vec.cumsum([0.1, 0.2, 0.3]))
print(vec.cumsum([1, 0.5, 2]))
```

```output
[] [] [7]
[0.1, 0.30000000000000004, 0.6000000000000001]
[1, 1.5, 3.5]
```

### Errors

An item that is not an int or a float, or an argument that is not a list, is a runtime
error, not an error value. A total past 64 bits is an `integer overflow` runtime error.

```quillo error
print(vec.cumsum([1, "a"]))
```

```output
line 1: `vec.cumsum` expects numbers, got int and str
```

```quillo error
print(vec.cumsum([9223372036854775807, 1]))
```

```output
line 1: integer overflow
```

### Chaining

A list of daily sales piped through `vec.cumsum` is the running total to each day:

```quillo
let sales = [3, 5, 4, 6, 8]
print(sales | vec.cumsum)
print(sales | vec.cumsum | last)
```

```output
[3, 8, 12, 18, 26]
26
```

### See also

[vec.cumprod](/docs/reference/vec.cumprod/), [vec.diff](/docs/reference/vec.diff/), [sum](/docs/reference/sum/), [vec.rolling_sum](/docs/reference/vec.rolling_sum/)
