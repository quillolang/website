# math.asinh
math.asinh(num) -> float
group: Math

### What it does

The inverse hyperbolic sine: the number whose `math.sinh` is the argument, as a
float, as Python's `math.asinh`. It takes any number.

### Examples

```quillo
print(math.asinh(0), math.asinh(1), math.asinh(-1))
print(math.asinh(math.sinh(2)))
```

```output
0.0 0.881373587019543 -0.881373587019543
2.0
```

### Edge cases

- The function is odd: `math.asinh(-x)` is `-math.asinh(x)`.
- A huge number is fine; the answer grows like a logarithm: `math.asinh(1e300)` is
  about `691`.
- `inf` gives `inf`, `-inf` gives `-inf`, `NaN` gives `NaN`.

```quillo
print(math.asinh(-3) == -math.asinh(3))
print(math.asinh(1e300), math.log(2e300))
print(math.asinh(math.inf), math.asinh(-math.inf), math.asinh(math.nan))
```

```output
true
691.4686750787736 691.4686750787737
inf -inf NaN
```

### Errors

There is no domain error. A value that is not a number is a runtime error, not an
error value: it stops the request; a decimal is converted first with `float`.

```quillo error
print(math.asinh("1"))
```

```output
line 1: `math.asinh` expects a number as argument 1, got str
```

### Chaining

```quillo
print(1 | math.asinh)
print([0, 1, 10] | map(math.asinh))
```

```output
0.881373587019543
[0.0, 0.881373587019543, 2.99822295029797]
```

### See also

[math.sinh](/docs/reference/math.sinh/), [math.acosh](/docs/reference/math.acosh/), [math.atanh](/docs/reference/math.atanh/), [math.log](/docs/reference/math.log/)
