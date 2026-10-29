# math.log1p
math.log1p(num) -> float
group: Math

### What it does

The natural logarithm of one plus the number, as a float, as Python's `math.log1p`.
For a number close to zero the answer is accurate where `math.log(1 + x)` is not,
since the addition there throws away most of the digits. Its inverse is
[math.expm1](/docs/reference/math.expm1/). The number must be above `-1`.

### Examples

```quillo
print(math.log1p(0), math.log1p(1), math.log1p(math.e - 1))
print(math.log1p(1e-10), math.log(1 + 1e-10))
```

```output
0.0 0.6931471805599453 1.0
0.00000000009999999999500001 0.0000000001000000082690371
```

### Edge cases

- `math.log(1 + 1e-20)` is `0.0`; `math.log1p(1e-20)` keeps the value.
- Just above `-1` the answer is a large negative number, not an error.
- `inf` gives `inf`, `NaN` gives `NaN`.
- `math.expm1` undoes it: `math.expm1(math.log1p(x))` is `x`.

```quillo
print(math.log(1 + 1e-20), math.log1p(1e-20))
print(math.log1p(-1 + 1e-16))
print(math.log1p(math.inf), math.log1p(math.nan))
print(math.expm1(math.log1p(0.3)))
```

```output
0.0 0.00000000000000000001
-36.7368005696771
inf NaN
0.3
```

### Errors

`-1` or less is a runtime error (a domain error), not an error value: it stops the
request, and `??` does not catch it. A value that is not a number is a runtime error
too.

```quillo error
print(math.log1p(-1))
```

```output
line 1: `math.log1p`: math domain error (-1)
```

```quillo error
print(math.log1p(-2))
```

```output
line 1: `math.log1p`: math domain error (-2)
```

### Chaining

A growth rate from a small change: `math.log1p` of the change is the continuous rate
behind it.

```quillo
let change = 0.0003
print(change | math.log1p)
print([0, 0.1, 1] | map(math.log1p))
```

```output
0.00029995500899797546
[0.0, 0.09531017980432487, 0.6931471805599453]
```

### See also

[math.expm1](/docs/reference/math.expm1/), [math.log](/docs/reference/math.log/), [math.exp](/docs/reference/math.exp/)
