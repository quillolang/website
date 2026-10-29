# math.remainder
math.remainder(num, num) -> float
group: Math

### What it does

The IEEE remainder: the first number minus the multiple of the second that is closest
to it, as a float, as Python's `math.remainder`. The result lies between `-|y| / 2` and
`|y| / 2`, so it can be negative for positive arguments: `math.remainder(8, 3)` is
`-1.0`, since 8 is closer to 9 than to 6. For the remainder with the dividend's sign
use [math.fmod](/docs/reference/math.fmod/) or `%`.

### Examples

```quillo
print(math.remainder(7, 3), math.remainder(8, 3), math.remainder(7.5, 2))
print(math.fmod(8, 3), 8 % 3)
```

```output
1.0 -1.0 -0.5
2.0 2
```

### Edge cases

- A tie goes to the even multiple: `math.remainder(7, 2)` is `-1.0` (7 is as close to
  8 as to 6, and 8 is 4 × 2) while `math.remainder(9, 2)` is `1.0`.
- The sign of the result is not the dividend's: `math.remainder(-5.5, 1)` is `0.5`.
- An infinite divisor leaves the number as it is.
- `-0.0` keeps its sign, and NaN in either place gives NaN.

```quillo
print(math.remainder(7, 2), math.remainder(9, 2), math.remainder(-5.5, 1))
print(math.remainder(7, float("inf")), math.remainder(-0.0, 3), math.remainder(float("nan"), 2))
```

```output
-1.0 1.0 0.5
7.0 -0.0 NaN
```

### Errors

A divisor of zero, or an infinite dividend, is a runtime error, `math domain error`,
not an error value. An argument that is not a number is a runtime error as well.

```quillo error
print(math.remainder(7, 0))
```

```output
line 1: `math.remainder`: math domain error (7, 0)
```

```quillo error
print(math.remainder(float("inf"), 3))
```

```output
line 1: `math.remainder`: math domain error (inf, 3)
```

### Chaining

In a pipeline the dividend comes first. The distance from the nearest multiple is its
absolute value:

```quillo
print(8 | math.remainder(3))
print([7, 8, 9] | map((x) => math.remainder(x, 3)) | map(math.fabs))
```

```output
-1.0
[1.0, 1.0, 0.0]
```

### See also

[math.fmod](/docs/reference/math.fmod/), [math.fabs](/docs/reference/math.fabs/), [round](/docs/reference/round/)
