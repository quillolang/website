# stats.geometric_mean
stats.geometric_mean(list) -> float
group: Statistics

### What it does

The geometric mean of a list of positive numbers: the n-th root of their product,
computed through logarithms as Python's `statistics.geometric_mean` does. It is the
mean to use for growth factors and ratios: the geometric mean of yearly growth
factors is the steady factor that gives the same total growth.

### Examples

```quillo
print(stats.geometric_mean([1, 4, 16]))
print(stats.geometric_mean([54, 24, 36]))
print(stats.geometric_mean([1.05, 1.1, 0.95]))
```

```output
4.0
36.000000000000014
1.031419164168326
```

### Edge cases

- The way through logarithms can leave the last digit off: one number comes back as
  itself up to rounding, `[7]` gives `6.999999999999999`.
- Every number must be positive: a zero is an error, not `0.0`.
- Ints and floats can mix; the answer is always a float.

```quillo
print(stats.geometric_mean([7]), stats.geometric_mean([7]) | round(6))
print(stats.geometric_mean([2, 8.0]))
```

```output
6.999999999999999 7.0
4.0
```

### Errors

No data, a zero, a negative number or something that is not a number are each a
runtime error, not an error value.

```quillo error
print(stats.geometric_mean([1, 0, 4]))
```

```output
line 1: `stats.geometric_mean` requires positive numbers
```

```quillo error
print(stats.geometric_mean([]))
```

```output
line 1: `stats.geometric_mean` requires at least one data point
```

### Chaining

```quillo
let returns = [0.05, 0.10, -0.05]
print(returns | map((r) => 1 + r) | stats.geometric_mean | round(4))
```

```output
1.0314
```

### See also

[stats.mean](/docs/reference/stats.mean/), [stats.harmonic_mean](/docs/reference/stats.harmonic_mean/), [math.prod](/docs/reference/math.prod/)
