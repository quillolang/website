# math.sinh
math.sinh(num) -> float
group: Math

### What it does

The hyperbolic sine of a number, as a float, as Python's `math.sinh`: `(e^x - e^-x) / 2`.
It takes any number, but grows like `math.exp`, so a large one overflows. Its inverse
is [math.asinh](/docs/reference/math.asinh/).

### Examples

```quillo
print(math.sinh(0), math.sinh(1), math.sinh(-1))
print(math.sinh(2), math.asinh(math.sinh(2)))
```

```output
0.0 1.1752011936438014 -1.1752011936438014
3.6268604078470186 2.0
```

### Edge cases

- The function is odd: `math.sinh(-x)` is `-math.sinh(x)`.
- `710` is about the largest input that fits a float; `711` is a range error, and so
  is `-711`.
- `inf` gives `inf`, `-inf` gives `-inf`, `NaN` gives `NaN`.
- `math.tanh(x)` is `math.sinh(x) / math.cosh(x)`.

```quillo
print(math.sinh(-2) == -math.sinh(2))
print(math.isfinite(math.sinh(710)), math.isfinite(math.sinh(-710)))
print(math.sinh(math.inf), math.sinh(-math.inf), math.sinh(math.nan))
print(math.tanh(1) == math.sinh(1) / math.cosh(1))
```

```output
true
true true
inf -inf NaN
true
```

### Errors

A result past the largest float is a runtime error (a range error), not an error
value: it stops the request, and `??` does not catch it. A value that is not a number
is a runtime error too.

```quillo error
print(math.sinh(711))
```

```output
line 1: `math.sinh`: math range error (711)
```

```quillo error
print(math.sinh(-711))
```

```output
line 1: `math.sinh`: math range error (-711)
```

### Chaining

```quillo
print(1 | math.sinh)
print([0, 1, 2] | map(math.sinh))
```

```output
1.1752011936438014
[0.0, 1.1752011936438014, 3.6268604078470186]
```

### See also

[math.cosh](/docs/reference/math.cosh/), [math.tanh](/docs/reference/math.tanh/), [math.asinh](/docs/reference/math.asinh/), [math.exp](/docs/reference/math.exp/), [math.sin](/docs/reference/math.sin/)
