# math.floor
math.floor(num) -> int
group: Math

### What it does

The largest int that is not above the number, as Python's `math.floor`. A float
gives an int, not a float: `math.floor(3.7)` is `3` and `math.floor(-3.7)` is `-4`,
since rounding goes toward minus infinity. An int is itself. For a decimal, or to keep
a float a float, use [floor](/docs/reference/floor/).

### Examples

```quillo
print(math.floor(3.7), math.floor(-3.7), math.floor(2.0))
print(math.floor(5), type_of(math.floor(3.7)))
print(math.floor(7 / 2))
```

```output
3 -4 2
5 int
3
```

### Edge cases

- A negative number rounds away from zero: `math.floor(-0.5)` is `-1`; for rounding
  toward zero use [math.trunc](/docs/reference/math.trunc/).
- `-0.0` gives `0`, an int, with no sign.
- A float past what an int holds (about 9.2 × 10¹⁸) is a runtime error, `integer
  overflow`, not a clamped value.
- A float whose fraction was lost to rounding floors as it is: `math.floor(0.1 + 0.2)`
  is `0`.

```quillo
print(math.floor(-0.5), math.floor(-0.0), math.floor(0.1 + 0.2))
print(math.floor(9.1e18))
```

```output
-1 0 0
9100000000000000000
```

```quillo error
print(math.floor(1e19))
```

```output
line 1: integer overflow
```

### Errors

Infinity and NaN cannot be an int, and are a runtime error, not an error value; so is
an argument that is not a number. A decimal is refused too, with a hint: convert it
with `float` first, or use [floor](/docs/reference/floor/), which takes a decimal.

```quillo error
print(math.floor(float("inf")))
```

```output
line 1: `math.floor`: cannot convert inf to an int
```

```quillo error
print(math.floor(dec("3.7")))
```

```output
line 1: `math.floor` expects a number as argument 1, got dec (this works on floats: convert a dec with float(x))
```

### Chaining

In a pipeline the number comes first, so `math.floor` takes it as its only argument.
The result is an int, ready for a list index or a count:

```quillo
print(17 / 4 | math.floor)
print([2.5, 3.5] | math.fsum | math.floor)
print([1.9, -1.9, 2.1] | map(math.floor))
```

```output
4
6
[1, -2, 2]
```

### See also

[math.ceil](/docs/reference/math.ceil/), [math.trunc](/docs/reference/math.trunc/), [floor](/docs/reference/floor/), [round](/docs/reference/round/), [int](/docs/reference/int/)
