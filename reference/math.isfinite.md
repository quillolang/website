# math.isfinite
math.isfinite(num) -> bool
group: Math

### What it does

Whether a number is neither infinite nor NaN, as Python's `math.isfinite`. Every int
is finite; a float is finite unless arithmetic ran past the largest float or had no
answer. It is the test to run before storing a computed float or sending it as JSON.

### Examples

```quillo
print(math.isfinite(1), math.isfinite(2.5), math.isfinite(1e308))
print(math.isfinite(float("inf")), math.isfinite(float("nan")))
```

```output
true true true
false false
```

### Edge cases

- The largest int is finite; so are `0.0` and `-0.0`.
- A float that overflowed is infinite and so not finite: `1e308 * 10` is `inf`.
- `inf - inf` is NaN, and not finite either.

```quillo
print(math.isfinite(9223372036854775807), math.isfinite(-0.0))
print(math.isfinite(1e308 * 10), math.isfinite(float("inf") - float("inf")))
```

```output
true true
false false
```

### Errors

An argument that is not a number is a runtime error, not an error value: text, `null`
and a decimal are refused rather than reported as not finite.

```quillo error
print(math.isfinite("1"))
```

```output
line 1: `math.isfinite` expects a number as argument 1, got str
```

### Chaining

In a pipeline the number comes first. Dropping the values that cannot be charted:

```quillo
print(1e308 * 10 | math.isfinite)
print([1.5, float("inf"), 2.5, float("nan")] | filter(math.isfinite))
```

```output
false
[1.5, 2.5]
```

### See also

[math.isinf](/docs/reference/math.isinf/), [math.isnan](/docs/reference/math.isnan/), [math.isclose](/docs/reference/math.isclose/), [float](/docs/reference/float/)
