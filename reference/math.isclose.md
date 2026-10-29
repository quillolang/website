# math.isclose
math.isclose(num, num, num=, num=) -> bool
group: Math

### What it does

Whether two numbers are close enough to count as equal, as Python's `math.isclose`:
`math.isclose(a, b, rel_tol, abs_tol)` is true when `|a - b|` is within `rel_tol`
times the larger of `|a|` and `|b|`, or within `abs_tol`. The defaults are a relative
tolerance of `1e-9` and an absolute one of `0`. It is the way to compare floats that
came out of arithmetic, where `0.1 + 0.2 == 0.3` is false.

### Examples

```quillo
print(math.isclose(0.1 + 0.2, 0.3), 0.1 + 0.2 == 0.3)
print(math.isclose(1.0, 1.0001), math.isclose(1.0, 1.0001, 1e-3))
print(math.isclose(5, 5.5, 0.1), math.isclose(5, 5.5, 0.0, 0.5))
```

```output
true false
false true
true true
```

### Edge cases

- The relative tolerance is of no use near zero: `math.isclose(0.0, 1e-12)` is false,
  since any fraction of zero is zero. Give an absolute tolerance there, as the fourth
  argument.
- The relative tolerance is symmetric: `math.isclose(3, 4, 0.25)` and
  `math.isclose(4, 3, 0.25)` agree, since the larger magnitude is used.
- Equal values are close whatever the tolerances; infinity is close only to itself,
  and NaN is close to nothing, itself included.
- `0.0` and `-0.0` are close.

```quillo
print(math.isclose(0.0, 1e-12), math.isclose(0.0, 1e-12, 1e-9, 1e-9))
print(math.isclose(3, 4, 0.25), math.isclose(4, 3, 0.25))
let inf = float("inf")
let nan = float("nan")
print(math.isclose(inf, inf), math.isclose(inf, 1e308), math.isclose(nan, nan), math.isclose(-0.0, 0.0))
```

```output
false true
true true
true false false true
```

### Errors

A negative tolerance is a runtime error, not an error value, as Python's `ValueError`.
An argument that is not a number is a runtime error as well.

```quillo error
print(math.isclose(1, 1, -1))
```

```output
line 1: `math.isclose`: tolerances must be non-negative
```

```quillo error
print(math.isclose(1, "1"))
```

```output
line 1: `math.isclose` expects a number as argument 2, got str
```

### Chaining

In a pipeline the first number comes first, so `x | math.isclose(y)`. Checking that a
computation lands where it should:

```quillo
print(math.sqrt(2) * math.sqrt(2) | math.isclose(2))
print([0.1 + 0.2, 0.3, 0.31] | map((x) => math.isclose(x, 0.3)))
```

```output
true
[true, true, false]
```

### See also

[math.isfinite](/docs/reference/math.isfinite/), [math.isnan](/docs/reference/math.isnan/), [math.fabs](/docs/reference/math.fabs/), [round](/docs/reference/round/)
