# math.sin
math.sin(num) -> float
group: Math

### What it does

The sine of an angle in radians, as a float, as Python's `math.sin`. An angle in
degrees is converted first with [math.radians](/docs/reference/math.radians/).

### Examples

```quillo
print(math.sin(0), math.sin(math.pi / 2), math.sin(1))
print(math.sin(math.radians(90)), math.sin(math.radians(30)))
```

```output
0.0 1.0 0.8414709848078965
1.0 0.49999999999999994
```

### Edge cases

- Floating point: `math.sin(math.pi)` is about `1.2e-16`, not `0`, and the sine of
  30 degrees is `0.49999999999999994`. Round when a clean figure is wanted.
- A huge angle is still reduced exactly, as Python does: `math.sin(1e22)` is
  `-0.8522008497671888`.
- `NaN` gives `NaN`; an infinite angle is a domain error.

```quillo
print(math.sin(math.pi), round(math.sin(math.pi), 12))
print(math.sin(math.radians(30)), round(math.sin(math.radians(30)), 10))
print(math.sin(1e22), math.sin(math.nan))
```

```output
0.00000000000000012246467991473532 0.0
0.49999999999999994 0.5
-0.8522008497671888 NaN
```

### Errors

`inf` or `-inf` is a runtime error (a domain error), not an error value: it stops the
request. A value that is not a number is a runtime error too; a decimal is converted
first with `float`.

```quillo error
print(math.sin(math.inf))
```

```output
line 1: `math.sin`: math domain error (inf)
```

```quillo error
print(math.sin("0"))
```

```output
line 1: `math.sin` expects a number as argument 1, got str
```

### Chaining

```quillo
print(90 | math.radians | math.sin)
print([0, 30, 90] | map(math.radians) | map(math.sin) | map((x) => round(x, 10)))
```

```output
1.0
[0.0, 0.5, 1.0]
```

### See also

[math.cos](/docs/reference/math.cos/), [math.tan](/docs/reference/math.tan/), [math.asin](/docs/reference/math.asin/), [math.radians](/docs/reference/math.radians/), [math.sinh](/docs/reference/math.sinh/)
