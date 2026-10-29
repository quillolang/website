# vec.clip
vec.clip(list, num | null, num | null=) -> list
group: Vectors

### What it does

Each item kept within a lower and an upper bound: an item below `lo` becomes `lo`, an
item above `hi` becomes `hi`, the rest stay as they are. Either bound may be `null` (or
`hi` left out) to clip on one side only.

### Examples

```quillo
print(vec.clip([-5, 0, 5, 10], 0, 8))
print(vec.clip([-5, 0, 5], 0, null))
print(vec.clip([1, 50], null, 10))
```

```output
[0, 0, 5, 8]
[0, 0, 5]
[1, 10]
```

### Edge cases

- An item that is replaced takes the bound as given, so an int bound puts an int in a
  float list and the other way round; items inside the bounds keep their own value and
  type.
- Leaving `hi` out clips below only.
- The same bound twice makes every item that bound.
- When `lo` is above `hi`, `lo` wins for an item below it.
- The empty list, or `null`, gives the empty list.

```quillo
print(vec.clip([1.0, 10.0], 2, 9), vec.clip([1, 10], 2.5, 9.5))
print(vec.clip([1, 2, 3], 2))
print(vec.clip([1.5, 2.5], 2, 2))
print(vec.clip([5], 8, 2))
print(vec.clip([], 0, 1), vec.clip(null, 0, 1))
```

```output
[2, 9] [2.5, 9.5]
[2, 2, 3]
[2, 2]
[8]
[] []
```

### Errors

An item that is not an int or a float, a bound that is neither a number nor `null`, or a
first argument that is not a list are runtime errors, not error values.

```quillo error
print(vec.clip([1, "x"], 0, 1))
```

```output
line 1: `vec.clip` expects a list of numbers, but item 1 is str
```

```quillo error
print(vec.clip([1], "a", 1))
```

```output
line 1: `vec.clip` expects a number as argument 2, got str
```

### Chaining

`xs | vec.clip(lo, hi)` caps a list in a pipeline, for example percentages to 0..100:

```quillo
print([-3, 42, 117] | vec.clip(0, 100))
print(vec.arange(-2, 3) | vec.clip(0) | sum)
```

```output
[0, 42, 100]
3
```

### See also

[vec.abs](/docs/reference/vec.abs/), [vec.round](/docs/reference/vec.round/), [min](/docs/reference/min/), [max](/docs/reference/max/)
