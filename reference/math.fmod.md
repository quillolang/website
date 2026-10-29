# math.fmod
math.fmod(num, num) -> float
group: Math

### What it does

The remainder of dividing the first number by the second, with the sign of the
first, as a float: C's `fmod` and Python's `math.fmod`. `math.fmod(-7, 3)` is `-1.0`.
The `%` operator follows the same sign rule and keeps ints as ints; `math.fmod`
always gives a float.

### Examples

```quillo
print(math.fmod(7, 3), math.fmod(-7, 3), math.fmod(7, -3))
print(math.fmod(7.5, 2), math.fmod(5.5, 1), math.fmod(-5.5, 1))
print(-7 % 3, type_of(math.fmod(7, 3)))
```

```output
1.0 -1.0 1.0
1.5 0.5 -0.5
-1 float
```

### Edge cases

- The sign is the first argument's, so the result lies between `-|y|` and `|y|`; for
  the remainder closest to zero use [math.remainder](/docs/reference/math.remainder/).
- An infinite divisor leaves the number as it is: `math.fmod(7, inf)` is `7.0`.
- A huge dividend is exact, not rounded: `math.fmod(1e300, 3)` is `0.0`.
- `-0.0` keeps its sign.
- NaN in either place gives NaN.

```quillo
print(math.fmod(7, float("inf")), math.fmod(1e300, 3), math.fmod(-0.0, 3))
print(math.fmod(float("nan"), 3))
```

```output
7.0 0.0 -0.0
NaN
```

### Errors

A divisor of zero, or an infinite dividend, is a runtime error, `math domain error`,
not an error value (Python raises `ValueError` there too). An argument that is not a
number is a runtime error as well.

```quillo error
print(math.fmod(7, 0))
```

```output
line 1: `math.fmod`: math domain error (7, 0)
```

```quillo error
print(math.fmod(float("inf"), 3))
```

```output
line 1: `math.fmod`: math domain error (inf, 3)
```

### Chaining

In a pipeline the dividend comes first, so `x | math.fmod(y)` is `x` modulo `y`:

```quillo
print(7 | math.fmod(2))
print([1.5, 2.5, 3.5] | map((x) => math.fmod(x, 1)))
```

```output
1.0
[0.5, 0.5, 0.5]
```

### See also

[math.remainder](/docs/reference/math.remainder/), [math.modf](/docs/reference/math.modf/), [math.trunc](/docs/reference/math.trunc/)
