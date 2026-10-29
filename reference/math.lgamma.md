# math.lgamma
math.lgamma(num) -> float
group: Math

### What it does

The natural logarithm of the absolute value of the gamma function, as Python's
`math.lgamma`: `math.lgamma(x)` is `log(|gamma(x)|)`, computed without forming
`gamma(x)` itself, so it works far past where `math.gamma` overflows.
`math.lgamma(n + 1)` is `log(n!)`, the size of a factorial that no int or float could
hold.

### Examples

```quillo
print(math.lgamma(5), math.log(24))
print(math.lgamma(1), math.lgamma(2), math.lgamma(0.5))
print(math.lgamma(1000))
```

```output
3.1780538303479458 3.1780538303479458
0.0 0.0 0.5723649429247001
5905.220423209181
```

### Edge cases

- `math.lgamma(1)` and `math.lgamma(2)` are `0.0`, since `0!` and `1!` are `1`; elsewhere
  it agrees with `math.log(math.gamma(x))` to a float's last digit or so.
- The sign of gamma is dropped: `math.lgamma(-0.5)` is `log(3.545...)`, positive,
  though `math.gamma(-0.5)` is negative.
- `math.gamma(172)` overflows a float but `math.lgamma(172)` is about `711.7`; the
  number of digits of `n!` is `math.lgamma(n + 1) / math.log(10)`, rounded up.
- Infinity gives infinity, not an error; NaN stays NaN.

```quillo
print(math.lgamma(-0.5), math.log(-math.gamma(-0.5)))
print(math.lgamma(172), math.ceil(math.lgamma(101) / math.log(10)))
print(math.lgamma(float("inf")), math.lgamma(float("nan")))
```

```output
1.2655121234846454 1.2655121234846454
711.71472580229 158
inf NaN
```

### Errors

Zero and the negative ints are the poles of gamma, and a runtime error here too,
`math domain error`, not an error value and not infinity, as Python's `ValueError`.
Minus infinity is the same. An argument so large that even the logarithm overflows a
float, `math.lgamma(1e308)`, is a runtime error, `math range error`. An argument that
is not a number is a runtime error as well.

```quillo error
print(math.lgamma(0))
```

```output
line 1: `math.lgamma`: math domain error (0)
```

```quillo error
print(math.lgamma(-1))
```

```output
line 1: `math.lgamma`: math domain error (-1)
```

### Chaining

In a pipeline the number comes first. `log(n choose k)` without any overflow:

```quillo
print(5 | math.lgamma)
let log_comb = (n, k) => math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)
print(math.exp(log_comb(10, 3)) | round, math.comb(10, 3))
```

```output
3.1780538303479458
120 120
```

### See also

[math.gamma](/docs/reference/math.gamma/), [math.factorial](/docs/reference/math.factorial/), [math.log](/docs/reference/math.log/), [math.comb](/docs/reference/math.comb/)
