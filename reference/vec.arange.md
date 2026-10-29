# vec.arange
vec.arange(num, num=, num=) -> list
group: Vectors

### What it does

Numbers from `start` up to but not including `stop`, `step` apart. With one argument it
is `stop`, and the list starts at 0; `step` is 1 when left out. Ints when `start` and
`step` are ints, floats otherwise. The count is `ceil((stop - start) / step)`.

### Examples

```quillo
print(vec.arange(5))
print(vec.arange(2, 5))
print(vec.arange(0, 10, 3))
print(vec.arange(5, 0, -1))
print(vec.arange(0, 1, 0.25))
```

```output
[0, 1, 2, 3, 4]
[2, 3, 4]
[0, 3, 6, 9]
[5, 4, 3, 2, 1]
[0.0, 0.25, 0.5, 0.75]
```

### Edge cases

- `stop` is never included: `vec.arange(0, 10, 4)` ends at 8.
- A `stop` at or before `start` with a positive step, including `stop` of 0 or a
  negative one, gives the empty list.
- A float `start` or `step` gives floats; a float `stop` alone does not.
- Float steps carry rounding: `vec.arange(0.1, 0.4, 0.1)` gives `0.30000000000000004`
  and, since the count is rounded up, one item more than expected. Prefer
  `vec.linspace` for a known number of points.
- `null` for `step` means 1.

```quillo
print(vec.arange(0, 10, 4))
print(vec.arange(0), vec.arange(5, 2), vec.arange(-3))
print(vec.arange(2.5), vec.arange(0, 5, 1.0), vec.arange(1.5, 3))
print(vec.arange(0.1, 0.4, 0.1))
print(vec.arange(0, 5, null))
```

```output
[0, 4, 8]
[] [] []
[0, 1, 2] [0.0, 1.0, 2.0, 3.0, 4.0] [1.5, 2.5]
[0.1, 0.2, 0.30000000000000004, 0.4]
[0, 1, 2, 3, 4]
```

### Errors

A step of 0, `NaN` or infinity, an argument that is not a number, or more than ten
million items are runtime errors, not error values. An infinite `stop` fails the count
with the same message a negative count gives.

```quillo error
print(vec.arange(0, 5, 0))
```

```output
line 1: `vec.arange`: step must be a non-zero number
```

```quillo error
print(vec.arange(100000000))
```

```output
line 1: `vec.arange`: 100000000 is not a count from 0 to 10000000
```

### Chaining

`vec.arange` starts a pipeline; `vec` arithmetic then shapes the numbers without a loop:

```quillo
print(vec.arange(8) | vec.mod(3))
print(vec.arange(1, 6) | vec.pow(2) | sum)
```

```output
[0, 1, 2, 0, 1, 2, 0, 1]
55.0
```

### See also

[vec.linspace](/docs/reference/vec.linspace/), [range](/docs/reference/range/), [vec.zeros](/docs/reference/vec.zeros/), [vec.full](/docs/reference/vec.full/)
