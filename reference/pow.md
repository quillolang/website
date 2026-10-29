# pow
pow(num, num) -> num
group: Math

### What it does

`x` to the power `y`. With two ints and a `y` of zero or more, the answer is an int
as long as it fits in 64 bits; otherwise it is a float. `pow(2, 10)` is `1024`,
`pow(2, 0.5)` is `1.4142135623730951`, `pow(2, -1)` is `0.5`.

### Examples

```quillo
print(pow(2, 10), pow(2, 0.5), pow(2.0, 10), pow(2, -1))
print(pow(10, 0), pow(-2, 3), pow(1.5, 2))
```

```output
1024 1.4142135623730951 1024.0 0.5
1 -8 2.25
```

### Edge cases

- An int answer past 64 bits is a float, not an overflow: `pow(2, 63)` is a float,
  `pow(2, 62)` an int. `pow(-2, 63)` still fits.
- A negative int exponent gives a float.
- `pow(0, 0)` is `1`; `pow(0, -1)` is `inf`; a float answer past what a float holds is
  `inf`.
- A negative base with a fractional exponent is `NaN`.

```quillo
print(pow(2, 62), pow(2, 63), type_of(pow(2, 63)), pow(-2, 63))
print(pow(0, 0), pow(0, -1), pow(2, 1024))
print(pow(-8, 1.0 / 3.0), pow(-1, 0.5))
```

```output
4611686018427387904 9223372036854776000 float -9223372036854775808
1 inf inf
NaN NaN
```

### Errors

A string, `null` or a boolean as either argument is a runtime error, not an error
value, and so is a decimal: convert it with `float` first. A missing exponent is a
runtime error too.

```quillo error
print(pow("2", 2))
```

```output
line 1: `pow` expects a number as argument 1, got str
```

```quillo error
print(pow(2m, 2))
```

```output
line 1: `pow` expects a number as argument 1, got dec (this works on floats: convert a dec with float(x))
```

### Chaining

In a pipeline the base comes first, so `x | pow(y)` is `pow(x, y)`:

```quillo
print(2 | pow(8), [2, 4] | map((x) => pow(x, 2)) | sum)
print(pow(9, 0.5) == sqrt(9))
```

```output
256 20
true
```

### See also

[sqrt](/docs/reference/sqrt/), [math.pow](/docs/reference/math.pow/), [abs](/docs/reference/abs/), [round](/docs/reference/round/)
