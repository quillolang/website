# math.expm1
math.expm1(num) -> float
group: Math

### What it does

`e` to the power of the number, minus one, as a float, as Python's `math.expm1`. For a
number close to zero the answer is accurate where `math.exp(x) - 1` is not, since the
subtraction there throws away most of the digits. Its inverse is
[math.log1p](/docs/reference/math.log1p/).

### Examples

```quillo
print(math.expm1(0), math.expm1(1), math.expm1(-1))
print(math.expm1(1e-10), math.exp(1e-10) - 1)
```

```output
0.0 1.718281828459045 -0.6321205588285577
0.000000000100000000005 0.0000000001000000082740371
```

### Edge cases

- `math.exp(1e-16) - 1` is `0.0`; `math.expm1(1e-16)` keeps the value.
- A large negative number gives `-1.0`, and so does `-inf`: underflow is not an error.
- `709` is about the largest input that fits a float; `710` is a range error.
- `math.log1p` undoes it: `math.log1p(math.expm1(x))` is `x`.

```quillo
print(math.exp(1e-16) - 1, math.expm1(1e-16))
print(math.expm1(-1000), math.expm1(-math.inf), math.isfinite(math.expm1(709)))
print(math.log1p(math.expm1(0.3)), math.expm1(math.nan))
```

```output
0.0 0.0000000000000001
-1.0 -1.0 true
0.3 NaN
```

### Errors

A result past the largest float is a runtime error (a range error), not an error
value: it stops the request. A value that is not a number is a runtime error too.

```quillo error
print(math.expm1(710))
```

```output
line 1: `math.expm1`: math range error (710)
```

### Chaining

Continuous growth at a rate over a time is `math.expm1(rate * t)`, which for a small
rate keeps the growth exact:

```quillo
let rate = 0.0001
print(rate * 2 | math.expm1)
print([0, 0.5, 1] | map(math.expm1))
```

```output
0.00020002000133340002
[0.0, 0.6487212707001282, 1.718281828459045]
```

### See also

[math.exp](/docs/reference/math.exp/), [math.log1p](/docs/reference/math.log1p/), [math.log](/docs/reference/math.log/)
