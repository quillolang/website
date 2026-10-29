# math.degrees
math.degrees(num) -> float
group: Math

### What it does

An angle in radians as degrees, a float, as Python's `math.degrees`: the number times
`180 / pi`. The trigonometric functions work in radians, so this turns their answers
into degrees; [math.radians](/docs/reference/math.radians/) goes the other way.

### Examples

```quillo
print(math.degrees(math.pi), math.degrees(math.pi / 2), math.degrees(1))
print(math.degrees(math.atan2(1, 1)), math.degrees(math.acos(-1)))
```

```output
180.0 90.0 57.29577951308232
45.0 180.0
```

### Edge cases

- Nothing is wrapped: `4 * pi` is `720.0`, not `0`.
- The answer is a float even for `0`.
- Round trips are exact in the usual cases: `math.degrees(math.radians(90))` is
  `90.0`; computed angles can miss by a digit, as `math.asin(0.5)` does.
- `inf` gives `inf`, `NaN` gives `NaN`; neither is an error.

```quillo
print(math.degrees(4 * math.pi), math.degrees(-math.pi / 4))
print(math.degrees(0))
print(math.degrees(math.radians(90)), math.degrees(math.asin(0.5)))
print(math.degrees(math.inf), math.degrees(math.nan))
```

```output
720.0 -45.0
0.0
90.0 30.000000000000004
inf NaN
```

### Errors

A value that is not a number is a runtime error, not an error value: it stops the
request. Text from a query or a form is converted first with `float`; a decimal too.

```quillo error
print(math.degrees("3.14"))
```

```output
line 1: `math.degrees` expects a number as argument 1, got str
```

```quillo
print(math.degrees(float("3.141592653589793")))
```

```output
180.0
```

### Chaining

```quillo
print(1 | math.atan | math.degrees)
print([0, math.pi / 6, math.pi / 2] | map(math.degrees))
```

```output
45.0
[0.0, 29.999999999999996, 90.0]
```

### See also

[math.radians](/docs/reference/math.radians/), [math.atan2](/docs/reference/math.atan2/), [math.asin](/docs/reference/math.asin/), [math.acos](/docs/reference/math.acos/)
