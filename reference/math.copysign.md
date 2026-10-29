# math.copysign
math.copysign(num, num) -> float
group: Math

### What it does

The first number's magnitude with the second number's sign, as a float, as Python's
`math.copysign`: `math.copysign(3, -1)` is `-3.0`. Only the sign of the second number
counts, not its size.

### Examples

```quillo
print(math.copysign(3, -1), math.copysign(-3, 1), math.copysign(-3, -100))
print(math.copysign(2.5, 0), type_of(math.copysign(1, 1)))
```

```output
-3.0 3.0 -3.0
2.5 float
```

### Edge cases

- `-0.0` carries a sign: `math.copysign(5, -0.0)` is `-5.0`, while `math.copysign(5, 0)`
  is `5.0`.
- Infinity takes a sign like any number: `math.copysign(inf, -1)` is `-inf`.
- NaN as the magnitude stays NaN; NaN as the sign counts as positive on this platform,
  as its sign bit happens to be.

```quillo
print(math.copysign(5, -0.0), math.copysign(5, 0), math.copysign(0.0, -1))
print(math.copysign(float("inf"), -1), math.copysign(1, float("nan")))
```

```output
-5.0 5.0 -0.0
-inf 1.0
```

### Errors

An argument that is not a number is a runtime error, not an error value: both
arguments must be numbers.

```quillo error
print(math.copysign(3, "-"))
```

```output
line 1: `math.copysign` expects a number as argument 2, got str
```

### Chaining

In a pipeline the magnitude comes first, so `x | math.copysign(s)` gives `x` the sign
of `s`. Rounding a value away from zero to a step:

```quillo
print(2.5 | math.copysign(-1))
let away = (x) => math.copysign(math.ceil(math.fabs(x)), x)
print(away(2.1), away(-2.1))
```

```output
-2.5
3.0 -3.0
```

### See also

[math.fabs](/docs/reference/math.fabs/), [abs](/docs/reference/abs/), [math.ceil](/docs/reference/math.ceil/)
