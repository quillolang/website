# math.exp2
math.exp2(num) -> float
group: Math

### What it does

`2` raised to the power of the number, as a float, as Python's `math.exp2`. The
exponent can be fractional or negative. For an int power of two that stays an int,
use [pow](/docs/reference/pow/).

### Examples

```quillo
print(math.exp2(10), math.exp2(0.5), math.exp2(-1))
print(math.exp2(10), pow(2, 10))
```

```output
1024.0 1.4142135623730951 0.5
1024.0 1024
```

### Edge cases

- The answer is a float even for a whole power: `math.exp2(10)` is `1024.0`.
- `1023` is the largest whole exponent that fits a float; `1024` is a range error.
- A large negative exponent gives `0.0`: underflow is not an error.
- `inf` gives `inf`, `-inf` gives `0.0`, `NaN` gives `NaN`.

```quillo
print(type_of(math.exp2(10)), type_of(pow(2, 10)))
print(math.isfinite(math.exp2(1023)), math.exp2(-2000))
print(math.exp2(math.inf), math.exp2(-math.inf), math.exp2(math.nan))
```

```output
float int
true 0.0
inf 0.0 NaN
```

### Errors

A result past the largest float is a runtime error (a range error), not an error
value: it stops the request. A value that is not a number is a runtime error too.

```quillo error
print(math.exp2(1024))
```

```output
line 1: `math.exp2`: math range error (1024)
```

```quillo error
print(math.exp2("10"))
```

```output
line 1: `math.exp2` expects a number as argument 1, got str
```

### Chaining

```quillo
print(8 | math.exp2)
print([0, 1, 2, 3] | map(math.exp2))
print(10 | math.exp2 | math.log2)
```

```output
256.0
[1.0, 2.0, 4.0, 8.0]
10.0
```

### See also

[math.log2](/docs/reference/math.log2/), [math.exp](/docs/reference/math.exp/), [math.pow](/docs/reference/math.pow/), [pow](/docs/reference/pow/), [math.ldexp](/docs/reference/math.ldexp/)
