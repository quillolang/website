# math.atanh
math.atanh(num) -> float
group: Math

### What it does

The inverse hyperbolic tangent: the number whose `math.tanh` is the argument, as a
float, as Python's `math.atanh`. The argument must be strictly between `-1` and `1`.

### Examples

```quillo
print(math.atanh(0), math.atanh(0.5), math.atanh(-0.5))
print(math.atanh(math.tanh(0.5)))
```

```output
0.0 0.5493061443340548 -0.5493061443340548
0.5
```

### Edge cases

- The ends are out: `1` and `-1` are domain errors, not infinities, as in Python.
- Close to `1` the answer grows fast: the largest float below `1` gives about `18.7`.
- Floating point: `math.atanh(math.tanh(2))` is `2.0000000000000004`.
- Floating point again: `math.atanh(-0.5)` and `-math.atanh(0.5)` differ in the last
  digit. `NaN` gives `NaN`.

```quillo
print(math.atanh(0.99999), math.atanh(0.9999999999999999))
print(math.atanh(math.tanh(2)))
print(math.atanh(-0.5), -math.atanh(0.5), math.atanh(math.nan))
```

```output
6.1030338227611125 18.714973875118524
2.0000000000000004
-0.5493061443340548 -0.5493061443340548 NaN
```

### Errors

`1`, `-1` or anything beyond them is a runtime error (a domain error), not an error
value: it stops the request, and `??` does not catch it. A value that is not a number
is a runtime error too.

```quillo error
print(math.atanh(1))
```

```output
line 1: `math.atanh`: math domain error (1)
```

```quillo error
print(math.atanh(2))
```

```output
line 1: `math.atanh`: math domain error (2)
```

### Chaining

```quillo
print(0.5 | math.atanh)
print([-0.5, 0, 0.5] | map(math.atanh))
```

```output
0.5493061443340548
[-0.5493061443340548, 0.0, 0.5493061443340548]
```

### See also

[math.tanh](/docs/reference/math.tanh/), [math.asinh](/docs/reference/math.asinh/), [math.acosh](/docs/reference/math.acosh/), [math.log1p](/docs/reference/math.log1p/)
