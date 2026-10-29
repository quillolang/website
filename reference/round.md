# round
round(num | dec, int=, str=) -> num | dec
group: Math

### What it does

The number rounded. `round(x)` on an int or a float gives an int, a half going away
from zero (`round(2.5)` is `3`, `round(-2.5)` is `-3`). `round(x, digits)` gives a
float with at most that many decimals (0 to 15). A decimal stays a decimal with
exactly `digits` decimals, rounded half to even unless a mode is given as the third
argument: `half_even` (the default), `half_up` (a half away from zero), `half_down`,
`up` (away from zero), `down` (toward zero), `ceiling` or `floor`.

### Examples

```quillo
print(round(2.5), round(-2.5), round(2.4), round(2))
print(round(3.14159, 2), round(1234.5678, 2))
print(round(12.5m), round(13.5m), round(12.345m, 2), round(12.5m, 2))
print(round(2.5m, 0, "half_up"), round(12.345m, 2, "half_up"), round(2.1m, 0, "ceiling"))
```

```output
3 -3 2 2
3.14 1234.57
12 14 12.34 12.50
3 12.35 3
```

### Edge cases

- With `digits` the answer is a float even for an int: `round(2, 2)` is `2.0`.
  Negative digits are 0 on a float; on a decimal they round to tens and hundreds.
- A float is binary, so `round(1.005, 2)` is `1.0`: `1.005` is a little under
  1.005. Decimals round exactly: `round(1.005m, 2, "half_up")` is `1.01`.
- Half to even on decimals: `12.5m` rounds to `12`, `13.5m` to `14`.
- A float too large for an int (about 9 × 10¹⁵ and up) stays a float; `NaN` and
  infinities stay as they are.
- `round(x, 0)` is a float `3.0`, where `round(x)` is the int `3`.

```quillo
print(round(2, 2), round(1234.5678, -2), round(1234.5m, -2))
print(round(1.005, 2), round(1.005m, 2), round(1.005m, 2, "half_up"))
print(round(12.5m), round(13.5m), round(-2.5m), round(0.5m))
print(round(1e16), type_of(round(1e16)), round(float("nan")))
print(round(2.5, 0), round(2.5))
```

```output
2.0 1235.0 1200
1.0 1.00 1.01
12 14 -2 0
10000000000000000 float NaN
3.0 3
```

### Errors

An argument that is not a number is a runtime error, not an error value, and so is
a rounding mode on a float: the modes are for decimals only. An unknown mode names
the seven that exist. Digits that are not an int (a float, `null`) are a runtime
error too.

```quillo error
print(round(2.5, 1, "half_up"))
```

```output
line 1: `round` takes a rounding mode for a dec only: convert with dec(x)
```

```quillo error
print(round(2.5m, 1, "nearest"))
```

```output
line 1: `round`: unknown rounding "nearest" (one of half_even, half_up, half_down, up, down, ceiling or floor)
```

### Chaining

```quillo
print([1.5, 2.5, 3.5] | map(round))
print(19.99m * 3 * 0.21m | round(2))
print([1.26, 2.71] | map((x) => round(x, 1)))
```

```output
[2, 3, 4]
12.59
[1.3, 2.7]
```

### See also

[floor](/docs/reference/floor/), [ceil](/docs/reference/ceil/), [abs](/docs/reference/abs/), [dec](/docs/reference/dec/), [int](/docs/reference/int/), [format_number](/docs/reference/format_number/)
