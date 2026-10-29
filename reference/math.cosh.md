# math.cosh
math.cosh(num) -> float
group: Math

### What it does

The hyperbolic cosine of a number, as a float, as Python's `math.cosh`: `(e^x + e^-x) / 2`.
It is `1` at zero and at least `1` everywhere, and grows like `math.exp`, so a large
number overflows. Its inverse is [math.acosh](/docs/reference/math.acosh/).

### Examples

```quillo
print(math.cosh(0), math.cosh(1), math.cosh(-1))
print(math.cosh(2), math.acosh(math.cosh(2)))
```

```output
1.0 1.5430806348152437 1.5430806348152437
3.7621956910836314 2.0
```

### Edge cases

- The function is even: `math.cosh(-x)` is `math.cosh(x)`, and the answer is never
  below `1`.
- `710` is about the largest input that fits a float; `711` is a range error, and so
  is `-711`.
- `inf` and `-inf` both give `inf`; `NaN` gives `NaN`.

```quillo
print(math.cosh(-2) == math.cosh(2), math.cosh(0.001) >= 1)
print(math.isfinite(math.cosh(710)), math.isfinite(math.cosh(-710)))
print(math.cosh(math.inf), math.cosh(-math.inf), math.cosh(math.nan))
```

```output
true true
true true
inf inf NaN
```

### Errors

A result past the largest float is a runtime error (a range error), not an error
value: it stops the request, and `??` does not catch it. A value that is not a number
is a runtime error too.

```quillo error
print(math.cosh(711))
```

```output
line 1: `math.cosh`: math range error (711)
```

```quillo error
print(math.cosh(null))
```

```output
line 1: `math.cosh` expects a number as argument 1, got null
```

### Chaining

The shape of a hanging chain is `a * cosh(x / a)`:

```quillo
let a = 2
print(1 | math.cosh)
print([-2, 0, 2] | map((x) => a * math.cosh(x / a)))
```

```output
1.5430806348152437
[3.0861612696304874, 2.0, 3.0861612696304874]
```

### See also

[math.sinh](/docs/reference/math.sinh/), [math.tanh](/docs/reference/math.tanh/), [math.acosh](/docs/reference/math.acosh/), [math.exp](/docs/reference/math.exp/), [math.cos](/docs/reference/math.cos/)
