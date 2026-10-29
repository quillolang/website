# math.hypot
math.hypot(num...) -> float
group: Math

### What it does

The Euclidean length of a vector given as separate numbers: the square root of the
sum of their squares, as a float, as Python's `math.hypot`. With two numbers it is the
hypotenuse of a right triangle; with more, the length in that many dimensions. The
squares are never formed outright, so very large and very small numbers neither
overflow nor underflow.

### Examples

```quillo
print(math.hypot(3, 4), math.hypot(1, 1))
print(math.hypot(1, 2, 2), math.hypot(3, 4, 12))
```

```output
5.0 1.4142135623730951
3.0 13.0
```

### Edge cases

- Signs do not matter; one number gives its absolute value, and no numbers give `0.0`.
- `math.sqrt(x * x + y * y)` overflows for `1e200`; `math.hypot` does not, and
  `1e-200` does not vanish either.
- An infinity gives `inf`, even next to a `NaN`. A `NaN` next to a number other than
  zero gives `NaN`; a `NaN` on its own, or next to zeros only, gives `0.0` (Python
  gives `NaN` there).
- The numbers are separate arguments, not a list: for a list use
  [vec.norm](/docs/reference/vec.norm/), and for two points
  [math.dist](/docs/reference/math.dist/).

```quillo
print(math.hypot(-3, -4), math.hypot(-5), math.hypot())
print(math.isfinite(math.hypot(1e200, 1e200)), math.hypot(1e-200, 1e-200) > 0)
print(math.hypot(math.inf, math.nan), math.hypot(math.nan, 1), math.hypot(math.nan, 0))
print(vec.norm([3, 4]), math.dist([0, 0], [3, 4]))
```

```output
5.0 5.0 0.0
true true
inf NaN 0.0
5.0 5.0
```

### Errors

There is no domain error. An argument that is not a number, a list included, is a
runtime error, not an error value: it stops the request.

```quillo error
print(math.hypot([3, 4]))
```

```output
line 1: `math.hypot` expects a number as argument 1, got list
```

```quillo error
print(math.hypot(3, null))
```

```output
line 1: `math.hypot` expects a number as argument 2, got null
```

### Chaining

In a pipeline the first number comes first, so `x | math.hypot(y)` is the length of
`(x, y)`:

```quillo
print(3 | math.hypot(4))
print([[3, 4], [5, 12]] | map((p) => math.hypot(p[0], p[1])))
```

```output
5.0
[5.0, 13.0]
```

### See also

[math.dist](/docs/reference/math.dist/), [vec.norm](/docs/reference/vec.norm/), [math.sqrt](/docs/reference/math.sqrt/), [math.atan2](/docs/reference/math.atan2/)
