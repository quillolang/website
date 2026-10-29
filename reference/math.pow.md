# math.pow
math.pow(num, num) -> float
group: Math

### What it does

The first number raised to the power of the second, always as a float, as Python's
`math.pow`. The plain [pow](/docs/reference/pow/) keeps an int result an int;
`math.pow` does not. A negative base takes only a whole exponent, and zero only a
non-negative one.

### Examples

```quillo
print(math.pow(2, 10), math.pow(2, 0.5), math.pow(2, -1))
print(math.pow(-2, 3), math.pow(10, 6))
print(math.pow(2, 10), pow(2, 10))
```

```output
1024.0 1.4142135623730951 0.5
-8.0 1000000.0
1024.0 1024
```

### Edge cases

- `math.pow(0, 0)` is `1.0`, as are `math.pow(1, NaN)` and `math.pow(NaN, 0)`.
- A negative base with a whole exponent is fine; with a fractional one it is a domain
  error, so a cube root of a negative number is [math.cbrt](/docs/reference/math.cbrt/).
- A result too small for a float is `0.0`, not an error; one too large is a range
  error.
- Infinities follow the usual rules: `2` to `inf` is `inf`, `0.5` to `inf` is `0.0`,
  `inf` to `-1` is `0.0`, `-inf` cubed is `-inf`.

```quillo
print(math.pow(0, 0), math.pow(1, math.nan), math.pow(math.nan, 0))
print(math.pow(-2, 2), math.pow(-8, 1/3 * 3), math.cbrt(-8))
print(math.pow(10, -400), math.isfinite(math.pow(10, 308)))
print(math.pow(2, math.inf), math.pow(0.5, math.inf), math.pow(math.inf, -1), math.pow(-math.inf, 3))
```

```output
1.0 1.0 1.0
4.0 -8.0 -2.0
0.0 true
inf 0.0 0.0 -inf
```

### Errors

Zero to a negative power, and a negative number to a fractional power, are runtime
errors (domain errors), not error values: they stop the request, and `??` does not
catch them. A result past the largest float is a range error, the same way. A value
that is not a number is a runtime error too; a decimal is converted first with
`float`.

```quillo error
print(math.pow(0, -1))
```

```output
line 1: `math.pow`: math domain error (0, -1)
```

```quillo error
print(math.pow(-8, 0.5))
```

```output
line 1: `math.pow`: math domain error (-8, 0.5)
```

```quillo error
print(math.pow(10, 400))
```

```output
line 1: `math.pow`: math range error (10, 400)
```

### Chaining

In a pipeline the base comes first, so `x | math.pow(2)` squares `x`. For a whole
list, [vec.pow](/docs/reference/vec.pow/) raises each item:

```quillo
print(3 | math.pow(2))
print([1, 2, 3] | map((x) => math.pow(x, 2)), vec.pow([1, 2, 3], 2))
print(1.05 | math.pow(10) | round(4))
```

```output
9.0
[1.0, 4.0, 9.0] [1.0, 4.0, 9.0]
1.6289
```

### See also

[pow](/docs/reference/pow/), [math.sqrt](/docs/reference/math.sqrt/), [math.cbrt](/docs/reference/math.cbrt/), [math.exp](/docs/reference/math.exp/), [math.exp2](/docs/reference/math.exp2/), [vec.pow](/docs/reference/vec.pow/)
