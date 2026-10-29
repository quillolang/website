# math.acosh
math.acosh(num) -> float
group: Math

### What it does

The inverse hyperbolic cosine: the number, zero or above, whose `math.cosh` is the
argument, as a float, as Python's `math.acosh`. The argument must be `1` or more.

### Examples

```quillo
print(math.acosh(1), math.acosh(2), math.acosh(10))
print(math.acosh(math.cosh(2)))
```

```output
0.0 1.3169578969248166 2.993222846126381
2.0
```

### Edge cases

- `1` gives `0.0`, the smallest answer; the answer is never negative, so
  `math.acosh(math.cosh(-2))` is `2.0`.
- A huge number is fine; the answer grows like a logarithm: `math.acosh(1e300)` is
  about `691`.
- `inf` gives `inf`, `NaN` gives `NaN`.

```quillo
print(math.acosh(1), math.acosh(math.cosh(-2)))
print(math.acosh(1e300), math.log(2e300))
print(math.acosh(math.inf), math.acosh(math.nan))
```

```output
0.0 2.0
691.4686750787736 691.4686750787737
inf NaN
```

### Errors

A number below `1` is a runtime error (a domain error), not an error value: it stops
the request, and `??` does not catch it. A value that is not a number is a runtime
error too.

```quillo error
print(math.acosh(0.5))
```

```output
line 1: `math.acosh`: math domain error (0.5)
```

```quillo error
print(math.acosh(-1))
```

```output
line 1: `math.acosh`: math domain error (-1)
```

### Chaining

```quillo
print(2 | math.acosh)
print([1, 2, 3] | map(math.acosh))
```

```output
1.3169578969248166
[0.0, 1.3169578969248166, 1.762747174039086]
```

### See also

[math.cosh](/docs/reference/math.cosh/), [math.asinh](/docs/reference/math.asinh/), [math.atanh](/docs/reference/math.atanh/), [math.log](/docs/reference/math.log/)
