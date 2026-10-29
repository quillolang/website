# math.frexp
math.frexp(num) -> list
group: Math

### What it does

A number taken apart into a mantissa and an exponent of two, as a list `[m, e]` with
`x == m * 2^e` and `0.5 <= |m| < 1`, as Python's `math.frexp`. `m` is a float and `e`
an int. `math.frexp(8)` is `[0.5, 4]`. [math.ldexp](/docs/reference/math.ldexp/) puts
the two back together.

### Examples

```quillo
print(math.frexp(8), math.frexp(0.75), math.frexp(-5), math.frexp(0.1))
let [m, e] = math.frexp(10)
print(m, e, math.ldexp(m, e))
```

```output
[0.5, 4] [0.75, 0] [-0.625, 3] [0.8, -3]
0.625 4 10.0
```

### Edge cases

- Zero gives `[0.0, 0]`, and `-0.0` gives `[-0.0, 0]`.
- The mantissa keeps the number's sign; the exponent is the number's size in bits,
  so `math.frexp(1)` is `[0.5, 1]` and `math.frexp(3)` is `[0.75, 2]`.
- Infinity and NaN come back as the mantissa with an exponent of `0`; neither is an
  error.
- The largest float has an exponent of `1024`.

```quillo
print(math.frexp(0), math.frexp(-0.0), math.frexp(1), math.frexp(3))
print(math.frexp(float("inf")), math.frexp(float("nan")), math.frexp(1e308))
```

```output
[0.0, 0] [-0.0, 0] [0.5, 1] [0.75, 2]
[inf, 0] [NaN, 0] [0.5562684646268004, 1024]
```

### Errors

An argument that is not a number is a runtime error, not an error value.

```quillo error
print(math.frexp(null))
```

```output
line 1: `math.frexp` expects a number as argument 1, got null
```

### Chaining

In a pipeline the number comes first. The exponent alone is the order of magnitude in
powers of two:

```quillo
print(1024 | math.frexp | last)
print([1, 2, 4, 1000] | map((x) => math.frexp(x) | last))
```

```output
11
[1, 2, 3, 10]
```

### See also

[math.ldexp](/docs/reference/math.ldexp/), [math.modf](/docs/reference/math.modf/), [math.log](/docs/reference/math.log/)
