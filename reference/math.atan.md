# math.atan
math.atan(num) -> float
group: Math

### What it does

The arc tangent: the angle in radians, between `-pi/2` and `pi/2`, whose tangent is
the number, as Python's `math.atan`. It takes any number. For the angle of a point
`(x, y)`, which needs the signs of both, use [math.atan2](/docs/reference/math.atan2/).

### Examples

```quillo
print(math.atan(0), math.atan(1), math.atan(-1))
print(math.degrees(math.atan(1)), math.atan(math.tan(1)))
```

```output
0.0 0.7853981633974483 -0.7853981633974483
45.0 1.0
```

### Edge cases

- `inf` gives `pi/2` and `-inf` gives `-pi/2`; a huge number is close to them.
- `math.atan(y / x)` loses the quadrant: `(-1, -1)` and `(1, 1)` give the same angle.
  `math.atan2(y, x)` keeps it.
- `math.atan(1) * 4` is exactly `math.pi`.
- `NaN` gives `NaN`.

```quillo
print(math.atan(math.inf), math.atan(-math.inf), math.atan(1e300))
print(math.atan(-1 / -1), math.atan2(-1, -1))
print(math.atan(1) * 4 == math.pi)
print(math.atan(math.nan))
```

```output
1.5707963267948966 -1.5707963267948966 1.5707963267948966
0.7853981633974483 -2.356194490192345
true
NaN
```

### Errors

There is no domain error. A value that is not a number is a runtime error, not an
error value: it stops the request; a decimal is converted first with `float`.

```quillo error
print(math.atan("1"))
```

```output
line 1: `math.atan` expects a number as argument 1, got str
```

### Chaining

```quillo
print(0.5 | math.atan | math.degrees)
print([0, 1, 2] | map(math.atan) | map(math.degrees))
```

```output
26.565051177077994
[0.0, 45.0, 63.43494882292202]
```

### See also

[math.atan2](/docs/reference/math.atan2/), [math.tan](/docs/reference/math.tan/), [math.asin](/docs/reference/math.asin/), [math.acos](/docs/reference/math.acos/), [math.degrees](/docs/reference/math.degrees/)
