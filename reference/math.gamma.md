# math.gamma
math.gamma(num) -> float
group: Math

### What it does

The gamma function, as Python's `math.gamma`: the factorial extended to any number, as
a float, with `math.gamma(n)` equal to `(n - 1)!` for a positive int `n`.
`math.gamma(5)` is `24.0`, `math.gamma(0.5)` is the square root of pi. It reaches past
where [math.factorial](/docs/reference/math.factorial/) overflows an int, up to
`math.gamma(171)`, which is `170!`.

### Examples

```quillo
print(math.gamma(5), math.gamma(1), math.gamma(6) == math.factorial(5))
print(math.gamma(0.5), math.gamma(1.5), math.gamma(10.5))
```

```output
24.0 1.0 true
1.772453850905516 0.886226925452758 1133278.3889487854
```

### Edge cases

- Negative non-integers have a value: `math.gamma(-0.5)` is about `-3.545`, and
  `math.gamma(-1.5)` is positive again.
- The answer is a float with a float's precision: `math.gamma(0.5) * math.gamma(0.5)`
  is pi to the last digit or so, not exactly.
- Values near zero grow without bound: `math.gamma(1e-300)` is about `1e300`.
- Plus infinity gives infinity, not an error; NaN stays NaN.

```quillo
print(math.gamma(-0.5), math.gamma(-1.5), math.gamma(171) > 1e306)
print(math.isclose(math.gamma(0.5) * math.gamma(0.5), math.pi))
print(math.gamma(float("inf")), math.gamma(float("nan")))
```

```output
-3.5449077018110318 2.363271801207355 true
true
inf NaN
```

### Errors

Zero and the negative ints are the poles: `math.gamma(0)` and `math.gamma(-2)` are a
runtime error, `math domain error`, not an error value and not infinity, as Python's
`ValueError`. So is minus infinity. A result too large for a float, `math.gamma(172)`
and up, is a runtime error, `math range error`; take [math.lgamma](/docs/reference/math.lgamma/)
instead. An argument that is not a number is a runtime error as well.

```quillo error
print(math.gamma(0))
```

```output
line 1: `math.gamma`: math domain error (0)
```

```quillo error
print(math.gamma(-2))
```

```output
line 1: `math.gamma`: math domain error (-2)
```

```quillo error
print(math.gamma(172))
```

```output
line 1: `math.gamma`: math range error (172)
```

### Chaining

In a pipeline the number comes first:

```quillo
print(5 | math.gamma)
print([1, 2, 3, 4, 5] | map(math.gamma))
```

```output
24.0
[1.0, 1.0, 2.0, 6.0, 24.0]
```

### See also

[math.lgamma](/docs/reference/math.lgamma/), [math.factorial](/docs/reference/math.factorial/), [math.erf](/docs/reference/math.erf/), [math.exp](/docs/reference/math.exp/)
