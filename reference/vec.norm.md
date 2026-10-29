# vec.norm
vec.norm(list, num=) -> float
group: Vectors

### What it does

The length of a list of numbers as a vector: without `p`, or with `p` of 2, the square
root of the sum of the squares. With `p` it is the p-norm, the sum of `|x|^p` to the
power `1/p`: `p` of 1 is the sum of the absolute values, and `p` of `math.inf` is the
largest absolute value. The result is always a float.

### Examples

```quillo
print(vec.norm([3, 4]))
print(vec.norm([3, 4], 1))
print(vec.norm([3, -4], math.inf))
```

```output
5.0
7.0
4.0
```

### Edge cases

- The empty list, or `null`, has length `0.0`.
- Ints give a float too: `vec.norm([3, 4])` is `5.0`.
- `p` of 0 divides by zero inside the formula and gives `inf`; it is not an error.
- `null` as `p` means 2.

```quillo
print(vec.norm([]), vec.norm(null))
print(vec.norm([1, 1, 1, 1], 4))
print(vec.norm([1, 2, 3], 0), vec.norm([3, 4], null))
```

```output
0.0 0.0
1.4142135623730951
inf 5.0
```

### Errors

A list with an item that is not an int or a float, a `p` that is not a number, or a
first argument that is not a list are runtime errors, not error values.

```quillo error
print(vec.norm([1], "x"))
```

```output
line 1: `vec.norm` expects a number as argument 2, got str
```

### Chaining

The distance between two points is the norm of their difference, and dividing a list by
its norm gives a unit vector:

```quillo
print(vec.sub([1, 1], [4, 5]) | vec.norm)
let v = [3, 4]
print(v | vec.div(vec.norm(v)))
```

```output
5.0
[0.6, 0.8]
```

### See also

[vec.dot](/docs/reference/vec.dot/), [vec.abs](/docs/reference/vec.abs/), [vec.pow](/docs/reference/vec.pow/), [math.hypot](/docs/reference/math.hypot/), [math.dist](/docs/reference/math.dist/)
