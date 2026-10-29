# math.modf
math.modf(num) -> list
group: Math

### What it does

The fractional and the integer part of a number, as a list of two floats,
`[fraction, whole]`, as Python's `math.modf`: `math.modf(3.75)` is `[0.75, 3.0]`. Both
parts carry the number's sign, so `math.modf(-3.75)` is `[-0.75, -3.0]`; the whole
part is truncated toward zero, as [math.trunc](/docs/reference/math.trunc/) does, but
stays a float.

### Examples

```quillo
print(math.modf(3.75), math.modf(-3.75), math.modf(5))
let [frac, whole] = math.modf(12.5)
print(frac, whole)
```

```output
[0.75, 3.0] [-0.75, -3.0] [0.0, 5.0]
0.5 12.0
```

### Edge cases

- The fraction comes first, the whole part second, as in Python.
- An int gives a fraction of `0.0` and the int as a float.
- A whole negative float gives a fraction of `0.0`, not `-0.0` as Python gives; the
  whole part keeps the sign.
- Infinity gives `[0.0, inf]`, and `-0.0` gives `[0.0, -0.0]`.
- A float so large that it has no fraction gives `0.0` and the number itself.

```quillo
print(math.modf(-3.0), math.modf(float("inf")), math.modf(-0.0))
print(math.modf(0.5), math.modf(-0.5))
```

```output
[0.0, -3.0] [0.0, inf] [0.0, -0.0]
[0.5, 0.0] [-0.5, -0.0]
```

### Errors

An argument that is not a number is a runtime error, not an error value. A decimal is
refused with a hint to convert it with `float`.

```quillo error
print(math.modf("3.75"))
```

```output
line 1: `math.modf` expects a number as argument 1, got str
```

### Chaining

In a pipeline the number comes first. `first` and `last` pick a part:

```quillo
print(3.75 | math.modf | first)
print(3.75 | math.modf | last)
print([1.25, 2.5] | map(math.modf))
```

```output
0.75
3.0
[[0.25, 1.0], [0.5, 2.0]]
```

### See also

[math.trunc](/docs/reference/math.trunc/), [math.frexp](/docs/reference/math.frexp/), [math.fmod](/docs/reference/math.fmod/), [int](/docs/reference/int/)
