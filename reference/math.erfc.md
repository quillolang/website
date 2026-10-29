# math.erfc
math.erfc(num) -> float
group: Math

### What it does

The complementary error function, `1 - erf(x)`, as Python's `math.erfc`, computed so
that the small values in the tail keep their digits: `1 - math.erf(5)` has lost most
of them to cancellation, `math.erfc(5)` has not. It runs from `2` at minus infinity to
`0` at plus infinity.

### Examples

```quillo
print(math.erfc(0), math.erfc(1), math.erfc(-1))
print(math.erfc(5), 1 - math.erf(5))
print(math.erf(0.5) + math.erfc(0.5))
```

```output
1.0 0.15729920705028513 1.842700792949715
0.0000000000015374597944280351 0.0000000000015374368445009168
1.0
```

### Edge cases

- `math.erfc(-x)` is `2 - math.erfc(x)`.
- The tail underflows to `0.0` around `x = 27`: `math.erfc(28)` is `0.0`.
- Infinity gives `0.0`, minus infinity `2.0`; NaN stays NaN. Neither is an error.

```quillo
print(math.erfc(2), math.erfc(28))
print(math.erfc(float("inf")), math.erfc(float("-inf")), math.erfc(float("nan")))
```

```output
0.004677734981047265 0.0
0.0 2.0 NaN
```

### Errors

An argument that is not a number is a runtime error, not an error value. There is no
domain error: every number has an answer.

```quillo error
print(math.erfc(null))
```

```output
line 1: `math.erfc` expects a number as argument 1, got null
```

### Chaining

In a pipeline the number comes first. A two-sided p-value from a z-score:

```quillo
print(1 | math.erfc)
let z = 1.96
print(math.fabs(z) / math.sqrt(2) | math.erfc | round(3))
```

```output
0.15729920705028513
0.05
```

### See also

[math.erf](/docs/reference/math.erf/), [stats.normal_cdf](/docs/reference/stats.normal_cdf/), [math.exp](/docs/reference/math.exp/)
