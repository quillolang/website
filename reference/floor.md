# floor
floor(num | dec) -> num | dec
group: Math

### What it does

The largest whole number not above the argument: `2.7` gives `2`, `-2.7` gives `-3`.
An int or a float gives an int; a decimal gives a decimal with no decimals.

### Examples

```quillo
print(floor(2.7), floor(-2.7), floor(3), floor(2.0))
print(floor(2.7m), floor(-2.7m))
print(floor(7 / 2))
```

```output
2 -3 3 2
2 -3
3
```

### Edge cases

- Negative numbers go down, away from zero: `floor(-0.5)` is `-1`. `int` cuts
  toward zero instead.
- The result of a float is an int; of a decimal a decimal: `floor(2.50m)` is `2m`.
- A float too large for an int (about 9 × 10¹⁵ and up), `NaN` and infinities stay
  floats.

```quillo
print(floor(-0.5), int(-0.5))
print(type_of(floor(2.7)), type_of(floor(2.7m)), floor(2.50m))
print(floor(1e16), type_of(floor(1e16)), floor(float("inf")))
```

```output
-1 0
int dec 2
10000000000000000 float inf
```

### Errors

A string, `null` or a boolean is a runtime error, not an error value.

```quillo error
print(floor("x"))
```

```output
line 1: `floor` expects a number as argument 1, got str
```

### Chaining

```quillo
print(3.7 | floor, [1.9, 2.1] | map(floor))
print(17 / 5 | floor, 17 % 5)
```

```output
3 [1, 2]
3 2
```

### See also

[ceil](/docs/reference/ceil/), [round](/docs/reference/round/), [int](/docs/reference/int/), [abs](/docs/reference/abs/)
