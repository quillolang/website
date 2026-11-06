# pow
pow(num | dec, num) -> num | dec
group: Math

### What it does

`x` to the power `y`. With two ints and a `y` of zero or more, the answer is an int,
exact: past 64 bits it is an overflow, as `*` gives, which `??` can catch. A float on
either side, or a negative `y`, gives a float. `pow(2, 10)` is `1024`, `pow(2, 0.5)` is
`1.4142135623730951`, `pow(2, -1)` is `0.5`. A decimal to an int's power is a decimal,
worked out by squaring, so interest and loan payments need no floats:
`pow(1m + 0.05m / 12, 360)` is `4.4677443140061322124280701433m`.

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

- An int answer past 64 bits is an overflow, not a float with digits that look exact:
  `pow(2, 62)` is an int, `pow(2, 63)` stops, and `pow(-2, 63)` still fits. For the
  float, give a float: `pow(2.0, 63)`.
- A negative int exponent of an int gives a float.
- An exponent of 2^32 or more is exact for a base of -1, 0 and 1 (`pow(-1,
  9007199254740993)` is `-1`), and an integer overflow for any other int base, as a
  smaller one past 64 bits is; it was a float (`1.0`, `inf`).
- `pow(0, 0)` is `1`; `pow(0, -1)` is `inf`; a float answer past what a float holds is
  `inf`.
- A negative base with a fractional exponent is `NaN`.
- A decimal's power is exact while the answer fits in a decimal, else each product is
  rounded as `*` rounds. A negative power is one over the positive one:
  `pow(2m, -2)` is `0.25`. `pow(0m, 0)` is `1`. An answer past a decimal's 29 digits
  is a `decimal overflow`, which `??` catches as it does an int's.

```quillo
print(pow(2, 62), pow(-2, 63), pow(2.0, 63))
print(pow(2, 63) ?? "too big", pow(10, 30) ?? "too big")
print(pow(-1, 9007199254740993), pow(0, 4294967296), pow(1, 4294967296), pow(2, 4294967296) ?? "too big")
print(pow(0, 0), pow(0, -1), pow(2.0, 1024))
print(pow(-8, 1.0 / 3.0), pow(-1, 0.5))
print(pow(2m, 2), pow(1.5m, 3), pow(2m, -2), pow(3m, -1), pow(0m, 0))
print(pow(1m + 0.05m / 12, 360), type_of(pow(1.1m, 2)), pow(10m, 29) ?? "too big")
```

```output
4611686018427387904 -9223372036854775808 9223372036854776000
too big too big
-1 0 1 too big
1 inf inf
NaN NaN
4 3.375 0.25 0.3333333333333333333333333333 1
4.4677443140061322124280701433 dec too big
```

### Errors

A string, `null` or a boolean as either argument is a runtime error, not an error
value. A decimal takes only an int's power: a float or a decimal as the power is a
runtime error, and `float(x)` with [math.pow](/docs/reference/math.pow/) is the way to
a fraction of a power. A decimal power of an int or a float is a runtime error too, and
so is a missing exponent. A decimal answer too large stops with `decimal overflow`
unless `??` catches it.

```quillo error
print(pow(2, 64))
```

```output
line 1: integer overflow
```

```quillo error
print(pow("2", 2))
```

```output
line 1: `pow` expects a number as argument 1, got str
```

```quillo error
print(pow(2m, 0.5))
```

```output
line 1: `pow` takes a dec to an int's power, got float as the power: for a fraction of a power, float(x) and math.pow
```

```quillo error
print(pow(10m, 29))
```

```output
line 1: decimal overflow
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
