# round
round(num | dec, int=, str=) -> num | dec
group: Math

### What it does

The number rounded. `round(x)` on an int or a float gives an int, a half going away
from zero (`round(2.5)` is `3`, `round(-2.5)` is `-3`). `round(x, digits)` of a float
gives a float with at most that many decimals (up to 15), rounded from the float's
shortest decimal, a tie away from zero, as `format_number` rounds; negative digits
round to tens, hundreds and so on (`round(1234.5678, -2)` is `1200.0`). An int with
`digits` stays an int: itself for 0 or more digits, and to tens or hundreds for fewer.
A decimal stays a decimal with exactly `digits` decimals, rounded half to even unless a
mode is given as the third argument: `half_even` (the default), `half_up` (a half away
from zero), `half_down`, `up` (away from zero), `down` (toward zero), `ceiling` or
`floor`.

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

- An int rounded to places is itself, as in Python: `round(2, 2)` is `2`, an int, and
  `round(9007199254740993, 2)` is that int exactly. To negative digits an int rounds a
  half away from zero, as a float does: `round(25, -1)` is `30`, where Python, which
  rounds half to even, gives `20`. Past what an int holds it is an integer overflow.
- Negative digits on a float give a float: `round(1234.5678, -2)` is `1200.0`. On a
  decimal they round to tens and hundreds too, by its mode.
- A float rounds from its shortest decimal, the digits it prints: `round(1.005, 2)` is
  `1.01`, though the binary float `1.005` is a little under 1.005, and `round(2.675, 2)`
  is `2.68`. It used to be `1.0`. Decimals round half to even unless a mode says
  otherwise: `round(1.005m, 2)` is `1.00`, and `1.01` with `"half_up"`.
- Half to even on decimals: `12.5m` rounds to `12`, `13.5m` to `14`.
- A float rounds to an int up to 2^63 (about 9.22 × 10¹⁸): `type_of(round(1e16))` is
  `int`. Past that it stays a float; `NaN` and infinities stay as they are.
- An int is itself, past 2^53 too: `round(9007199254740993)` is `9007199254740993`, on
  the server and in the browser.
- `round(x, 0)` of a float is a float `3.0`, where `round(x)` is the int `3`.
- `round(a / b)` of two ints divides in ints, so it is exact past 2^53, however the call
  is written (`round(a / b)`, `a / b | round`, `(a / b).round()`): a half goes away from
  zero. A quotient kept in a variable first is a float, and rounds as one.

```quillo
print(round(2, 2), round(1234.5678, -2), round(1234.5m, -2), round(1255, -1), round(25, -1))
print(round(1.005, 2), round(2.675, 2), round(-1.005, 2), round(1.005m, 2), round(1.005m, 2, "half_up"))
print(round(12.5m), round(13.5m), round(-2.5m), round(0.5m))
print(round(1e16), type_of(round(1e16)), round(float("nan")))
print(round(2.5, 0), round(2.5), round(-7 / 2), round(9007199254740995 / 2))
```

```output
2 1200.0 1200 1260 30
1.01 2.68 -1.01 1.00 1.01
12 14 -2 0
10000000000000000 int NaN
3.0 3 -4 4503599627370498
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
