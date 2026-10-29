# math.cbrt
math.cbrt(num) -> float
group: Math

### What it does

The cube root of a number, as a float, as Python's `math.cbrt`. A negative number has a
negative cube root, so unlike [math.sqrt](/docs/reference/math.sqrt/) and
[math.pow](/docs/reference/math.pow/) it takes any number.

### Examples

```quillo
print(math.cbrt(27), math.cbrt(-8), math.cbrt(2))
print(math.cbrt(0.001), math.cbrt(1e30))
```

```output
3.0 -2.0 1.2599210498948732
0.1 10000000000.0
```

### Edge cases

- A perfect cube comes back whole: `math.cbrt(-27) == -3`.
- `0` gives `0.0`; infinity keeps its sign; `NaN` gives `NaN`.
- `math.pow(-8, 1/3)` is a domain error (a fractional power of a negative number), so
  `math.cbrt` is the way to a negative cube root.

```quillo
print(math.cbrt(-27) == -3, math.cbrt(0))
print(math.cbrt(-math.inf), math.cbrt(math.nan))
print(math.cbrt(-8), math.pow(8, 1/3))
```

```output
true 0.0
-inf NaN
-2.0 2.0
```

### Errors

There is no domain error: every number has a cube root. A value that is not a number
is a runtime error, not an error value; a decimal is converted first with `float`.

```quillo error
print(math.cbrt("8"))
```

```output
line 1: `math.cbrt` expects a number as argument 1, got str
```

```quillo error
print(math.pow(-8, 1/3))
```

```output
line 1: `math.pow`: math domain error (-8, 0.3333333333333333)
```

### Chaining

```quillo
print(2 * 2 * 2 | math.cbrt)
print([1, 8, 27] | map(math.cbrt))
```

```output
2.0
[1.0, 2.0, 3.0]
```

### See also

[math.sqrt](/docs/reference/math.sqrt/), [math.pow](/docs/reference/math.pow/), [pow](/docs/reference/pow/), [math.exp](/docs/reference/math.exp/)
