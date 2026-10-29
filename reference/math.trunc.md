# math.trunc
math.trunc(num) -> int
group: Math

### What it does

The number with its fraction dropped, as an int: rounding toward zero, as Python's
`math.trunc`. `math.trunc(3.7)` is `3` and `math.trunc(-3.7)` is `-3`. An int is
itself. It is what [int](/docs/reference/int/) does to a float, but a value that is
not a number is a runtime error here rather than an error value.

### Examples

```quillo
print(math.trunc(3.7), math.trunc(-3.7), math.trunc(7))
print(math.trunc(2.9) == int(2.9), type_of(math.trunc(2.9)))
```

```output
3 -3 7
true int
```

### Edge cases

- For a positive number it is [math.floor](/docs/reference/math.floor/); for a
  negative one it is [math.ceil](/docs/reference/math.ceil/): `math.trunc(-0.5)` is `0`.
- `-7 / 2` is `-3.5`, and truncates to `-3`.
- A float past what an int holds (about 9.2 × 10¹⁸) is a runtime error, `integer
  overflow`.

```quillo
print(math.trunc(-0.5), math.trunc(-7 / 2))
print(math.trunc(0.999), math.trunc(-0.999))
```

```output
0 -3
0 0
```

```quillo error
print(math.trunc(-1e19))
```

```output
line 1: integer overflow
```

### Errors

Infinity and NaN cannot be an int and are a runtime error, not an error value; so is
`null` or any other value that is not a number. A decimal is refused with a hint to
convert it with `float`.

```quillo error
print(math.trunc(null))
```

```output
line 1: `math.trunc` expects a number as argument 1, got null
```

### Chaining

In a pipeline the number comes first:

```quillo
print(7.9 | math.trunc)
print([1.5, -1.5, 2.5] | map(math.trunc))
```

```output
7
[1, -1, 2]
```

### See also

[math.floor](/docs/reference/math.floor/), [math.ceil](/docs/reference/math.ceil/), [math.modf](/docs/reference/math.modf/), [int](/docs/reference/int/), [round](/docs/reference/round/)
