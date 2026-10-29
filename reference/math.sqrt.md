# math.sqrt
math.sqrt(num) -> float
group: Math

### What it does

The square root of a number, as a float, the way Python's `math.sqrt` gives it. An int
is fine as input; the answer is a float even for a perfect square. A negative number is
a runtime error, where the plain [sqrt](/docs/reference/sqrt/) gives `NaN`.

### Examples

```quillo
print(math.sqrt(16), math.sqrt(2), math.sqrt(0.25))
print(math.sqrt(1e10), math.sqrt(2) * math.sqrt(2))
```

```output
4.0 1.4142135623730951 0.5
100000.0 2.0000000000000004
```

### Edge cases

- `0` gives `0.0`, and `-0.0` gives `-0.0`, which is not negative enough to be an error.
- Infinity gives infinity and `NaN` gives `NaN`; neither is an error.
- Floating point: `math.sqrt(2) * math.sqrt(2)` is not `2`. Compare with
  [math.isclose](/docs/reference/math.isclose/).
- An exact root of a big int is wanted as an int: [math.isqrt](/docs/reference/math.isqrt/).

```quillo
print(math.sqrt(0), math.sqrt(-0.0))
print(math.sqrt(math.inf), math.sqrt(math.nan))
print(math.sqrt(2) * math.sqrt(2) == 2, math.isclose(math.sqrt(2) * math.sqrt(2), 2))
print(math.sqrt(9007199254740993), math.isqrt(9007199254740993))
```

```output
0.0 -0.0
inf NaN
false true
94906265.62425156 94906265
```

### Errors

A negative number is a runtime error, not an error value: it stops the request, and
`??` does not catch it, so test the sign first when a negative input is possible. The
plain `sqrt(-1)` is `NaN` instead. A value that is not a number is a runtime error too;
a decimal is converted first with `float`.

```quillo error
print(math.sqrt(-1))
```

```output
line 1: `math.sqrt`: math domain error (-1)
```

```quillo error
print(math.sqrt(dec("4")))
```

```output
line 1: `math.sqrt` expects a number as argument 1, got dec (this works on floats: convert a dec with float(x))
```

```quillo
print(sqrt(-1), math.sqrt(float(dec("4"))))
```

```output
NaN 2.0
```

### Chaining

In a pipeline the number comes first, so `math.sqrt` takes it as its only argument. For
a whole list, [vec.sqrt](/docs/reference/vec.sqrt/) does the same in one call:

```quillo
print(3 * 3 + 4 * 4 | math.sqrt)
print([1, 4, 9] | map(math.sqrt), vec.sqrt([1, 4, 9]))
```

```output
5.0
[1.0, 2.0, 3.0] [1.0, 2.0, 3.0]
```

### See also

[sqrt](/docs/reference/sqrt/), [math.cbrt](/docs/reference/math.cbrt/), [math.pow](/docs/reference/math.pow/), [math.isqrt](/docs/reference/math.isqrt/), [math.hypot](/docs/reference/math.hypot/), [vec.sqrt](/docs/reference/vec.sqrt/)
