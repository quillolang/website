# sqrt
sqrt(num) -> float
group: Math

### What it does

The square root, always a float: `sqrt(16)` is `4.0`. A negative number gives `NaN`,
not an error; `math.sqrt` is the version that errors, as Python does.

### Examples

```quillo
print(sqrt(16), sqrt(2), sqrt(2.25))
print(sqrt(pow(3, 2) + pow(4, 2)))
```

```output
4.0 1.4142135623730951 1.5
5.0
```

### Edge cases

- The result is a float even for a perfect square: `sqrt(16)` is `4.0`, `int` makes
  it `4`.
- `sqrt(-1)` is `NaN`, which equals nothing, itself included: test it with
  `math.isnan`.
- `sqrt(0)` is `0.0`.

```quillo
print(type_of(sqrt(16)), int(sqrt(16)))
print(sqrt(-1), sqrt(-1) == sqrt(-1), math.isnan(sqrt(-1)))
print(sqrt(0))
```

```output
float 4
NaN false true
0.0
```

### Errors

A string, `null` or a boolean is a runtime error, not an error value, and so is a
decimal: convert it with `float` first.

```quillo error
print(sqrt("4"))
```

```output
line 1: `sqrt` expects a number as argument 1, got str
```

```quillo error
print(sqrt(4m))
```

```output
line 1: `sqrt` expects a number as argument 1, got dec (this works on floats: convert a dec with float(x))
```

### Chaining

```quillo
print(16 | sqrt, [1, 4, 9] | map(sqrt))
print(2 | sqrt | round(3))
```

```output
4.0 [1.0, 2.0, 3.0]
1.414
```

### See also

[pow](/docs/reference/pow/), [math.sqrt](/docs/reference/math.sqrt/), [math.isnan](/docs/reference/math.isnan/), [abs](/docs/reference/abs/), [round](/docs/reference/round/)
