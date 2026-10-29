# math.acos
math.acos(num) -> float
group: Math

### What it does

The arc cosine: the angle in radians, between `0` and `pi`, whose cosine is the
number, as Python's `math.acos`. The number must be between `-1` and `1`. The angle
in degrees comes from [math.degrees](/docs/reference/math.degrees/).

### Examples

```quillo
print(math.acos(1), math.acos(0), math.acos(-1))
print(math.acos(0.5), math.degrees(math.acos(0.5)))
```

```output
0.0 1.5707963267948966 3.141592653589793
1.0471975511965976 59.99999999999999
```

### Edge cases

- Floating point: `math.acos(0.5)` in degrees is `59.99999999999999`. Round when a
  clean figure is wanted.
- A value a hair past `1` from a computation (`1.0000000000000002`, a dot product of
  unit vectors can give it) is a domain error, so clamp a computed value to `-1..1`
  first.
- `math.acos(math.cos(x))` gives `x` back, to the last digit, only for `x` between `0`
  and `pi`: `-1` comes back as `1`.
- `NaN` gives `NaN`.

```quillo
print(math.degrees(math.acos(0.5)), round(math.degrees(math.acos(0.5)), 10))
let c = 1.0000000000000002
print(math.acos(min([1, max([-1, c])])))
print(math.acos(math.cos(1)), math.acos(math.cos(-1)))
print(math.acos(math.nan))
```

```output
59.99999999999999 60.0
0.0
0.9999999999999999 0.9999999999999999
NaN
```

### Errors

A number outside `-1..1`, infinity included, is a runtime error (a domain error), not
an error value: it stops the request, and `??` does not catch it. A value that is not
a number is a runtime error too.

```quillo error
print(math.acos(2))
```

```output
line 1: `math.acos`: math domain error (2)
```

```quillo error
print(math.acos(math.inf))
```

```output
line 1: `math.acos`: math domain error (inf)
```

### Chaining

The angle between two vectors, from their dot product:

```quillo
let a = [1, 0]
let b = [1, 1]
print(vec.dot(a, b) / (vec.norm(a) * vec.norm(b)) | math.acos | math.degrees | round(6))
print([1, 0, -1] | map(math.acos))
```

```output
45.0
[0.0, 1.5707963267948966, 3.141592653589793]
```

### See also

[math.cos](/docs/reference/math.cos/), [math.asin](/docs/reference/math.asin/), [math.atan2](/docs/reference/math.atan2/), [math.degrees](/docs/reference/math.degrees/), [vec.dot](/docs/reference/vec.dot/)
