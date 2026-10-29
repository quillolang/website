# math.isnan
math.isnan(num) -> bool
group: Math

### What it does

Whether a float is NaN, "not a number", as Python's `math.isnan`. NaN comes out of
arithmetic that has no answer, `inf - inf` or `float("nan")`, and it is the one value
that is not equal to itself, so `x == x` is false for it and `math.isnan` is the way
to catch it.

### Examples

```quillo
let nan = float("nan")
print(math.isnan(nan), math.isnan(1), math.isnan(2.5))
print(nan == nan, math.isnan(nan))
```

```output
true false false
false true
```

### Edge cases

- Infinity is not NaN.
- `inf - inf`, `0.0 * inf` and `sqrt(-1)` are NaN; `math.sqrt(-1)` is a runtime error
  instead, so it never gives one.
- `0 / 0` is a runtime error, division by zero, not NaN.

```quillo
let inf = float("inf")
print(math.isnan(inf), math.isnan(inf - inf), math.isnan(0.0 * inf), math.isnan(sqrt(-1)))
```

```output
false true true true
```

### Errors

An argument that is not a number is a runtime error, not an error value: `null` is
refused rather than reported as NaN.

```quillo error
print(math.isnan(null))
```

```output
line 1: `math.isnan` expects a number as argument 1, got null
```

### Chaining

In a pipeline the number comes first. Dropping the NaNs before a statistic:

```quillo
print(sqrt(-1) | math.isnan)
print([1.0, sqrt(-1), 3.0] | filter((x) => !math.isnan(x)) | stats.mean)
```

```output
true
2.0
```

### See also

[math.isfinite](/docs/reference/math.isfinite/), [math.isinf](/docs/reference/math.isinf/), [math.isclose](/docs/reference/math.isclose/), [sqrt](/docs/reference/sqrt/)
