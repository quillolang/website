# ceil
ceil(num | dec) -> num | dec
group: Math

### What it does

The smallest whole number not below the argument: `2.1` gives `3`, `-2.1` gives `-2`.
An int or a float gives an int; a decimal gives a decimal with no decimals.

### Examples

```quillo
print(ceil(2.1), ceil(-2.1), ceil(3), ceil(2.0))
print(ceil(2.1m), ceil(-2.1m))
print(ceil(10 / 3))
```

```output
3 -2 3 2
3 -2
4
```

### Edge cases

- Negative numbers go up, toward zero: `ceil(-0.5)` is `0`.
- The result of a float is an int; of a decimal a decimal.
- A float gives an int up to 2^63 (about 9.22 × 10¹⁸): `type_of(ceil(1e16))` is `int`.
  Past that, and `NaN` and infinities, it stays a float.
- An int is itself, past 2^53 too, as it never goes through a float:
  `ceil(9007199254740993)` is `9007199254740993`, on the server and in the browser.

- `ceil(a / b)` of two ints divides in ints, so it is exact past 2^53, however the call
  is written (`ceil(a / b)`, `a / b | ceil`, `(a / b).ceil()`, `math.ceil(a / b)`). A
  quotient kept in a variable first is a float.

```quillo
print(ceil(-0.5), ceil(0.0001))
print(type_of(ceil(2.1)), type_of(ceil(2.1m)))
print(ceil(1e16), type_of(ceil(1e16)), ceil(float("nan")))
print(ceil(9007199254740995 / 2), ceil(-7 / 2))
```

```output
0 1
int dec
10000000000000000 int NaN
4503599627370498 -3
```

### Errors

A string, `null` or a boolean is a runtime error, not an error value.

```quillo error
print(ceil(null))
```

```output
line 1: `ceil` expects a number as argument 1, got null
```

### Chaining

Pages for a list, a rate per started unit:

```quillo
let items = 23
print(items / 10 | ceil)
print([0.2, 1.5] | map(ceil))
```

```output
3
[1, 2]
```

### See also

[floor](/docs/reference/floor/), [round](/docs/reference/round/), [int](/docs/reference/int/), [abs](/docs/reference/abs/)
