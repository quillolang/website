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
- A float too large for an int (about 9 × 10¹⁵ and up), `NaN` and infinities stay
  floats.

```quillo
print(ceil(-0.5), ceil(0.0001))
print(type_of(ceil(2.1)), type_of(ceil(2.1m)))
print(ceil(1e16), type_of(ceil(1e16)), ceil(float("nan")))
```

```output
0 1
int dec
10000000000000000 float NaN
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
