# math.tanh
math.tanh(num) -> float
group: Math

### What it does

The hyperbolic tangent of a number, as a float, as Python's `math.tanh`:
`sinh(x) / cosh(x)`. The answer is always between `-1` and `1`, and it takes any
number without overflowing. Its inverse is [math.atanh](/docs/reference/math.atanh/).

### Examples

```quillo
print(math.tanh(0), math.tanh(1), math.tanh(-1))
print(math.tanh(0.5), math.atanh(math.tanh(0.5)))
```

```output
0.0 0.7615941559557649 -0.7615941559557649
0.46211715726000974 0.5
```

### Edge cases

- Past about `19` the answer is exactly `1.0` (and `-1.0` below `-19`); a huge input
  is not an error.
- `inf` gives `1.0`, `-inf` gives `-1.0`, `NaN` gives `NaN`.
- The function is odd: `math.tanh(-x)` is `-math.tanh(x)`.

```quillo
print(math.tanh(20), math.tanh(-20), math.tanh(1e300))
print(math.tanh(math.inf), math.tanh(-math.inf), math.tanh(math.nan))
print(math.tanh(-2) == -math.tanh(2))
```

```output
1.0 -1.0 1.0
1.0 -1.0 NaN
true
```

### Errors

There is no domain or range error. A value that is not a number is a runtime error,
not an error value: it stops the request; a decimal is converted first with `float`.

```quillo error
print(math.tanh(dec("1")))
```

```output
line 1: `math.tanh` expects a number as argument 1, got dec (this works on floats: convert a dec with float(x))
```

### Chaining

A squashing function: any number ends up in `-1..1`.

```quillo
print(3 | math.tanh)
print([-100, -1, 0, 1, 100] | map(math.tanh))
```

```output
0.9950547536867305
[-1.0, -0.7615941559557649, 0.0, 0.7615941559557649, 1.0]
```

### See also

[math.sinh](/docs/reference/math.sinh/), [math.cosh](/docs/reference/math.cosh/), [math.atanh](/docs/reference/math.atanh/), [math.tan](/docs/reference/math.tan/)
