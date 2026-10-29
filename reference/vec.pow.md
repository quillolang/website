# vec.pow
vec.pow(list, num) -> list
group: Vectors

### What it does

Each item raised to a power. The result is always a list of floats, even for ints to a
whole power: `vec.pow([2, 3], 2)` is `[4.0, 9.0]`. A fractional power takes a root, so
`vec.pow(xs, 0.5)` is `vec.sqrt(xs)`.

### Examples

```quillo
print(vec.pow([1, 2, 3], 2))
print(vec.pow([4, 9], 0.5))
print(vec.pow([2, 3], 3))
```

```output
[1.0, 4.0, 9.0]
[2.0, 3.0]
[8.0, 27.0]
```

### Edge cases

- A negative number to a fractional power is `NaN`, not an error.
- `x` to the power 0 is `1.0`, for 0 too; a negative power gives the reciprocal.
- The empty list gives the empty list.
- A power past what a float holds is `inf`.

```quillo
print(vec.pow([-8], 1 / 3), vec.pow([-2], 0.5))
print(vec.pow([0, 5], 0), vec.pow([2, 4], -1))
print(vec.pow([], 2))
print(vec.pow([10], 400))
```

```output
[NaN] [NaN]
[1.0, 1.0] [0.5, 0.25]
[]
[inf]
```

### Errors

A list with an item that is not an int or a float, a missing or non-numeric power, or a
first argument that is not a list are runtime errors, not error values.

```quillo error
print(vec.pow([1, "a"], 2))
```

```output
line 1: `vec.pow` expects a list of numbers, but item 1 is str
```

```quillo error
print(vec.pow([1, 2]))
```

```output
line 1: `vec.pow` expects a number as argument 2, got nothing
```

### Chaining

`xs | vec.pow(2)` squares a list; summed, it is the squared length:

```quillo
print(vec.arange(1, 4) | vec.pow(2) | sum)
print([3, 4] | vec.pow(2) | sum | math.sqrt)
```

```output
14.0
5.0
```

### See also

[vec.sqrt](/docs/reference/vec.sqrt/), [vec.exp](/docs/reference/vec.exp/), [vec.mul](/docs/reference/vec.mul/), [vec.norm](/docs/reference/vec.norm/), [math.pow](/docs/reference/math.pow/)
