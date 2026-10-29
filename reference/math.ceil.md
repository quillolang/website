# math.ceil
math.ceil(num) -> int
group: Math

### What it does

The smallest int that is not below the number, as Python's `math.ceil`. A float gives
an int: `math.ceil(3.2)` is `4` and `math.ceil(-3.2)` is `-3`, since rounding goes
toward plus infinity. An int is itself. For a decimal, or to keep a float a float,
use [ceil](/docs/reference/ceil/).

### Examples

```quillo
print(math.ceil(3.2), math.ceil(-3.2), math.ceil(2.0))
print(math.ceil(-5), type_of(math.ceil(3.2)))
print(math.ceil(7 / 2))
```

```output
4 -3 2
-5 int
4
```

### Edge cases

- A negative number rounds toward zero: `math.ceil(-0.5)` is `0`, the same as
  [math.trunc](/docs/reference/math.trunc/) gives there.
- Any positive fraction, however small, rounds up: `math.ceil(0.3)` is `1`.
- A float past what an int holds (about 9.2 × 10¹⁸) is a runtime error, `integer
  overflow`.
- Pages of ten for 21 items: `math.ceil(21 / 10)` is `3`. Division of ints that does
  not come out even is a float, which is why this works.

```quillo
print(math.ceil(-0.5), math.ceil(0.3), math.ceil(21 / 10))
```

```output
0 1 3
```

```quillo error
print(math.ceil(1e19))
```

```output
line 1: integer overflow
```

### Errors

Infinity and NaN cannot be an int and are a runtime error, not an error value; so is
an argument that is not a number, text included. A decimal is refused with a hint to
convert it with `float`, or use [ceil](/docs/reference/ceil/).

```quillo error
print(math.ceil("3"))
```

```output
line 1: `math.ceil` expects a number as argument 1, got str
```

```quillo error
print(math.ceil(float("nan")))
```

```output
line 1: `math.ceil`: cannot convert NaN to an int
```

### Chaining

In a pipeline the number comes first:

```quillo
print(21 / 10 | math.ceil)
print([0.1, 1.5, 2.0] | map(math.ceil))
```

```output
3
[1, 2, 2]
```

### See also

[math.floor](/docs/reference/math.floor/), [math.trunc](/docs/reference/math.trunc/), [ceil](/docs/reference/ceil/), [round](/docs/reference/round/), [int](/docs/reference/int/)
