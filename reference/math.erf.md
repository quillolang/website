# math.erf
math.erf(num) -> float
group: Math

### What it does

The error function, as Python's `math.erf`: `2 / sqrt(pi)` times the integral of
`exp(-t²)` from `0` to `x`. It runs from `-1` to `1`, is `0` at `0`, and gives the
normal distribution's cumulative probability as `(1 + erf(x / sqrt(2))) / 2`;
[stats.normal_cdf](/docs/reference/stats.normal_cdf/) does that for you.

### Examples

```quillo
print(math.erf(0), math.erf(1), math.erf(-1))
print(math.erf(0.5), math.erf(2))
print((1 + math.erf(1 / math.sqrt(2))) / 2, stats.normal_cdf(1))
```

```output
0.0 0.8427007929497148 -0.8427007929497148
0.5204998778130465 0.9953222650189527
0.8413447460685429 0.8413447460685429
```

### Edge cases

- It is odd: `math.erf(-x)` is `-math.erf(x)`, and `-0.0` gives `-0.0`.
- It saturates fast: `math.erf(6)` is exactly `1.0` in a float. For the tail that is
  left use [math.erfc](/docs/reference/math.erfc/), which keeps the small value.
- Infinity gives `1.0` or `-1.0`; NaN stays NaN. Neither is an error.

```quillo
print(math.erf(-0.0), math.erf(3), math.erf(6))
print(math.erf(float("inf")), math.erf(float("-inf")), math.erf(float("nan")))
```

```output
-0.0 0.9999779095030015 1.0
1.0 -1.0 NaN
```

### Errors

An argument that is not a number is a runtime error, not an error value. There is no
domain error: every number has an answer.

```quillo error
print(math.erf("a"))
```

```output
line 1: `math.erf` expects a number as argument 1, got str
```

### Chaining

In a pipeline the number comes first:

```quillo
print(1 | math.erf)
print([-1, 0, 1] | map(math.erf))
```

```output
0.8427007929497148
[-0.8427007929497148, 0.0, 0.8427007929497148]
```

### See also

[math.erfc](/docs/reference/math.erfc/), [stats.normal_cdf](/docs/reference/stats.normal_cdf/), [math.exp](/docs/reference/math.exp/), [math.gamma](/docs/reference/math.gamma/)
