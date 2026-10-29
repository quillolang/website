# math.cos
math.cos(num) -> float
group: Math

### What it does

The cosine of an angle in radians, as a float, as Python's `math.cos`. An angle in
degrees is converted first with [math.radians](/docs/reference/math.radians/).

### Examples

```quillo
print(math.cos(0), math.cos(math.pi), math.cos(1))
print(math.cos(math.radians(60)), math.cos(2 * math.pi))
```

```output
1.0 -1.0 0.5403023058681398
0.5000000000000001 1.0
```

### Edge cases

- Floating point: `math.cos(math.pi / 2)` is about `6.1e-17`, not `0`, and the cosine
  of 60 degrees is `0.5000000000000001`. Round when a clean figure is wanted.
- A huge angle is still reduced exactly, as Python does.
- `NaN` gives `NaN`; an infinite angle is a domain error.

```quillo
print(math.cos(math.pi / 2), round(math.cos(math.pi / 2), 12))
print(math.cos(math.radians(60)), round(math.cos(math.radians(60)), 10))
print(math.cos(1e22), math.cos(math.nan))
```

```output
0.00000000000000006123233995736766 0.0
0.5000000000000001 0.5
0.523214785395139 NaN
```

### Errors

`inf` or `-inf` is a runtime error (a domain error), not an error value: it stops the
request. A value that is not a number is a runtime error too; a decimal is converted
first with `float`.

```quillo error
print(math.cos(-math.inf))
```

```output
line 1: `math.cos`: math domain error (-inf)
```

```quillo error
print(math.cos(null))
```

```output
line 1: `math.cos` expects a number as argument 1, got null
```

### Chaining

The dot product of two unit vectors is the cosine of the angle between them, so the
angle comes back with [math.acos](/docs/reference/math.acos/):

```quillo
print(60 | math.radians | math.cos | round(10))
print([0, 60, 180] | map(math.radians) | map(math.cos) | map((x) => round(x, 10)))
print(0.5 | math.acos | math.degrees)
```

```output
0.5
[1.0, 0.5, -1.0]
60.00000000000001
```

### See also

[math.sin](/docs/reference/math.sin/), [math.tan](/docs/reference/math.tan/), [math.acos](/docs/reference/math.acos/), [math.radians](/docs/reference/math.radians/), [math.cosh](/docs/reference/math.cosh/)
