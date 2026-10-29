# math.atan2
math.atan2(num, num) -> float
group: Math

### What it does

The angle in radians, between `-pi` and `pi`, from the positive x axis to the point
`(x, y)`, as Python's `math.atan2`. The order is `y` first, then `x`. Unlike
`math.atan(y / x)` it keeps the quadrant, and `x` may be zero.

### Examples

```quillo
print(math.atan2(1, 1), math.degrees(math.atan2(1, 1)))
print(math.degrees(math.atan2(1, -1)), math.degrees(math.atan2(-1, -1)), math.degrees(math.atan2(-1, 1)))
```

```output
0.7853981633974483 45.0
135.0 -135.0 -45.0
```

### Edge cases

- `x` zero is fine, nothing is divided: `(0, 1)` is straight up, `pi/2`.
- Both zero give `0.0`, not an error.
- A zero `y` with a negative `x` is `pi`, or `-pi` when the zero is `-0.0`.
- Infinities give the diagonal angles; `NaN` in either gives `NaN`.

```quillo
print(math.atan2(1, 0), math.atan2(-1, 0))
print(math.atan2(0, 0))
print(math.atan2(0, -1), math.atan2(-0.0, -1))
print(math.atan2(math.inf, math.inf), math.atan2(1, math.nan))
```

```output
1.5707963267948966 -1.5707963267948966
0.0
3.141592653589793 -3.141592653589793
0.7853981633974483 NaN
```

### Errors

There is no domain error. A missing second argument, or a value that is not a number,
is a runtime error, not an error value: it stops the request.

```quillo error
print(math.atan2(1))
```

```output
line 1: `math.atan2` expects a number as argument 2, got nothing
```

```quillo error
print(math.atan2("1", 2))
```

```output
line 1: `math.atan2` expects a number as argument 1, got str
```

### Chaining

In a pipeline `y` comes first, so `y | math.atan2(x)` works. A point as a list is
taken apart with `let [x, y] = p`:

```quillo
let [x, y] = [3, 4]
print(y | math.atan2(x) | math.degrees)
print([[1, 0], [0, 1], [-1, 0]] | map((p) => math.degrees(math.atan2(p[1], p[0]))))
```

```output
53.13010235415598
[0.0, 90.0, 180.0]
```

### See also

[math.atan](/docs/reference/math.atan/), [math.hypot](/docs/reference/math.hypot/), [math.degrees](/docs/reference/math.degrees/), [math.sin](/docs/reference/math.sin/), [math.cos](/docs/reference/math.cos/)
