# math.exp
math.exp(num) -> float
group: Math

### What it does

`e` raised to the power of the number, as a float, as Python's `math.exp`. It is the
inverse of [math.log](/docs/reference/math.log/): `math.exp(math.log(x))` is `x`, give
or take the last digit.

### Examples

```quillo
print(math.exp(0), math.exp(1), math.exp(-1))
print(math.exp(10), math.exp(math.log(10)))
```

```output
1.0 2.718281828459045 0.36787944117144233
22026.465794806718 10.000000000000002
```

### Edge cases

- A large negative number gives `0.0`: underflow is not an error.
- `709` is about the largest input that fits a float (about 8.2 × 10³⁰⁷); `710` is a
  range error.
- `-inf` gives `0.0`, `inf` gives `inf`, `NaN` gives `NaN`.
- For `math.exp(x) - 1` with a tiny `x`, [math.expm1](/docs/reference/math.expm1/)
  keeps the digits that the subtraction loses.

```quillo
print(math.exp(-1000), math.isfinite(math.exp(709)))
print(math.exp(-math.inf), math.exp(math.inf), math.exp(math.nan))
print(math.exp(1e-10) - 1, math.expm1(1e-10))
```

```output
0.0 true
0.0 inf NaN
0.0000000001000000082740371 0.000000000100000000005
```

### Errors

An input whose result is past the largest float is a runtime error (a range error),
not an error value: it stops the request, and `??` does not catch it. A value that is
not a number is a runtime error too; a decimal is converted first with `float`.

```quillo error
print(math.exp(710))
```

```output
line 1: `math.exp`: math range error (710)
```

```quillo error
print(math.exp(null))
```

```output
line 1: `math.exp` expects a number as argument 1, got null
```

### Chaining

In a pipeline the number comes first. For a whole list, [vec.exp](/docs/reference/vec.exp/)
does the same in one call:

```quillo
let rate = 0.05
print(rate * 10 | math.exp)
print([0, 1, 2] | map(math.exp), vec.exp([0, 1, 2]))
```

```output
1.6487212707001282
[1.0, 2.718281828459045, 7.38905609893065] [1.0, 2.718281828459045, 7.38905609893065]
```

### See also

[math.log](/docs/reference/math.log/), [math.expm1](/docs/reference/math.expm1/), [math.exp2](/docs/reference/math.exp2/), [math.pow](/docs/reference/math.pow/), [vec.exp](/docs/reference/vec.exp/)
