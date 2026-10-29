# math.isinf
math.isinf(num) -> bool
group: Math

### What it does

Whether a number is positive or negative infinity, as Python's `math.isinf`. An int
is never infinite. A float becomes infinite when arithmetic runs past the largest
float, or when it is made so with `float("inf")`.

### Examples

```quillo
print(math.isinf(float("inf")), math.isinf(float("-inf")), math.isinf(1))
print(math.isinf(1e308 * 10), 1e308 * 10)
```

```output
true true false
true inf
```

### Edge cases

- NaN is not infinite: `math.isinf(nan)` is false, as `math.isfinite(nan)` is. Test
  for it with [math.isnan](/docs/reference/math.isnan/).
- The largest float, `1.8e308`, is not infinite; `1e309` as a literal already is.
- Division by zero does not make infinity: it is a runtime error, so `math.isinf` never
  sees it.

```quillo
print(math.isinf(float("nan")), math.isinf(1.8e308), math.isinf(1e309))
```

```output
false true true
```

### Errors

An argument that is not a number is a runtime error, not an error value.

```quillo error
print(math.isinf("inf"))
```

```output
line 1: `math.isinf` expects a number as argument 1, got str
```

### Chaining

In a pipeline the number comes first:

```quillo
print(1e308 * 10 | math.isinf)
print([1.0, float("inf"), 3.0] | map(math.isinf))
```

```output
true
[false, true, false]
```

### See also

[math.isfinite](/docs/reference/math.isfinite/), [math.isnan](/docs/reference/math.isnan/), [float](/docs/reference/float/)
