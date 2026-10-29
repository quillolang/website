# math.asin
math.asin(num) -> float
group: Math

### What it does

The arc sine: the angle in radians, between `-pi/2` and `pi/2`, whose sine is the
number, as Python's `math.asin`. The number must be between `-1` and `1`. The angle
in degrees comes from [math.degrees](/docs/reference/math.degrees/).

### Examples

```quillo
print(math.asin(0), math.asin(1), math.asin(-1))
print(math.asin(0.5), math.degrees(math.asin(0.5)))
```

```output
0.0 1.5707963267948966 -1.5707963267948966
0.5235987755982988 29.999999999999996
```

### Edge cases

- Floating point: `math.asin(0.5)` in degrees is `29.999999999999996`. Round when a
  clean figure is wanted.
- A value a hair past `1` from a computation (`1.0000000000000002`) is a domain error,
  so clamp a computed value to `-1..1` first.
- `math.asin(math.sin(x))` is `x` only for `x` between `-pi/2` and `pi/2`.
- `NaN` gives `NaN`.

```quillo
print(math.degrees(math.asin(0.5)), round(math.degrees(math.asin(0.5)), 10))
let c = 1.0000000000000002
print(math.asin(min([1, max([-1, c])])))
print(math.asin(math.sin(1)), math.asin(math.sin(3)))
print(math.asin(math.nan))
```

```output
29.999999999999996 30.0
1.5707963267948966
1.0 0.14159265358979323
NaN
```

### Errors

A number outside `-1..1`, infinity included, is a runtime error (a domain error), not
an error value: it stops the request, and `??` does not catch it. A value that is not
a number is a runtime error too.

```quillo error
print(math.asin(2))
```

```output
line 1: `math.asin`: math domain error (2)
```

```quillo error
print(math.asin(1.0000000000000002))
```

```output
line 1: `math.asin`: math domain error (1.0000000000000002)
```

### Chaining

```quillo
print(0.5 | math.asin | math.degrees | round(6))
print([0, 0.5, 1] | map(math.asin))
```

```output
30.0
[0.0, 0.5235987755982988, 1.5707963267948966]
```

### See also

[math.sin](/docs/reference/math.sin/), [math.acos](/docs/reference/math.acos/), [math.atan](/docs/reference/math.atan/), [math.atan2](/docs/reference/math.atan2/), [math.degrees](/docs/reference/math.degrees/)
