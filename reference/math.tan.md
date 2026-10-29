# math.tan
math.tan(num) -> float
group: Math

### What it does

The tangent of an angle in radians, as a float, as Python's `math.tan`. An angle in
degrees is converted first with [math.radians](/docs/reference/math.radians/).

### Examples

```quillo
print(math.tan(0), math.tan(math.pi / 4), math.tan(1))
print(math.tan(math.radians(45)), math.tan(-math.pi / 4))
```

```output
0.0 0.9999999999999999 1.557407724654902
0.9999999999999999 -0.9999999999999999
```

### Edge cases

- Floating point: the tangent of 45 degrees is `0.9999999999999999`. Round when a
  clean figure is wanted.
- `math.pi / 2` is not exactly a right angle, so `math.tan(math.pi / 2)` is a huge
  number (about `1.6e16`), not infinity and not an error.
- `NaN` gives `NaN`; an infinite angle is a domain error.
- `math.tan(x)` is `math.sin(x) / math.cos(x)`.

```quillo
print(math.tan(math.radians(45)), round(math.tan(math.radians(45)), 10))
print(math.tan(math.pi / 2) > 1e16, math.isfinite(math.tan(math.pi / 2)))
print(math.tan(math.nan))
print(math.tan(1) == math.sin(1) / math.cos(1))
```

```output
0.9999999999999999 1.0
true true
NaN
true
```

### Errors

`inf` or `-inf` is a runtime error (a domain error), not an error value: it stops the
request. A value that is not a number is a runtime error too; a decimal is converted
first with `float`.

```quillo error
print(math.tan(math.inf))
```

```output
line 1: `math.tan`: math domain error (inf)
```

```quillo error
print(math.tan(dec("1")))
```

```output
line 1: `math.tan` expects a number as argument 1, got dec (this works on floats: convert a dec with float(x))
```

### Chaining

A slope from an angle, and the angle back with [math.atan](/docs/reference/math.atan/):

```quillo
print(30 | math.radians | math.tan)
print(30 | math.radians | math.tan | math.atan | math.degrees)
```

```output
0.5773502691896256
29.999999999999996
```

### See also

[math.sin](/docs/reference/math.sin/), [math.cos](/docs/reference/math.cos/), [math.atan](/docs/reference/math.atan/), [math.atan2](/docs/reference/math.atan2/), [math.radians](/docs/reference/math.radians/), [math.tanh](/docs/reference/math.tanh/)
