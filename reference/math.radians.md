# math.radians
math.radians(num) -> float
group: Math

### What it does

An angle in degrees as radians, a float, as Python's `math.radians`: the number times
`pi / 180`. The trigonometric functions take radians, so this goes in front of them;
[math.degrees](/docs/reference/math.degrees/) goes the other way.

### Examples

```quillo
print(math.radians(180), math.radians(90), math.radians(45))
print(math.radians(1), math.sin(math.radians(90)))
```

```output
3.141592653589793 1.5707963267948966 0.7853981633974483
0.017453292519943295 1.0
```

### Edge cases

- Nothing is wrapped: `540` is `3 * pi`, not `pi`.
- The answer is a float even for `0`.
- `math.radians(math.degrees(x))` gives `x` back in the usual cases.
- `inf` gives `inf`, `NaN` gives `NaN`; neither is an error.

```quillo
print(math.radians(540), math.radians(-90))
print(math.radians(0))
print(math.radians(math.degrees(1)), math.radians(360) == 2 * math.pi)
print(math.radians(math.inf), math.radians(math.nan))
```

```output
9.42477796076938 -1.5707963267948966
0.0
1.0 true
inf NaN
```

### Errors

A value that is not a number is a runtime error, not an error value: it stops the
request. Text from a query or a form is converted first with `float`; a decimal too.

```quillo error
print(math.radians("90"))
```

```output
line 1: `math.radians` expects a number as argument 1, got str
```

```quillo error
print(math.radians(dec("90")))
```

```output
line 1: `math.radians` expects a number as argument 1, got dec (this works on floats: convert a dec with float(x))
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

[math.degrees](/docs/reference/math.degrees/), [math.sin](/docs/reference/math.sin/), [math.cos](/docs/reference/math.cos/), [math.tan](/docs/reference/math.tan/)
