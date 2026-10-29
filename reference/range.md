# range
range(int, int=) -> list
group: Lists

### What it does

A list of consecutive ints. `range(n)` counts from `0` up to but not including `n`;
`range(a, b)` counts from `a` up to but not including `b`. The step is always 1, and
`a..b` is the same list written as an operator.

### Examples

```quillo
print(range(5))
print(range(2, 5))
print(range(-3, 1))
print(0..3)
for i in range(3) {
    print("row", i)
}
```

```output
[0, 1, 2, 3, 4]
[2, 3, 4]
[-3, -2, -1, 0]
[0, 1, 2]
row 0
row 1
row 2
```

### Edge cases

- `range(0)`, a negative count, or an end at or before the start give `[]`: the list
  never counts down. For a descending list, [reverse](/docs/reference/reverse/) it.
- The end is not included: `range(1, 6)` is 1 to 5, and `range(a, b)` has `b - a`
  items.
- At most ten million items; past that is a runtime error (see Errors).
- No step: map the list to get every other number.

```quillo
print(range(0), range(-2), range(5, 2), range(3, 3))
print(range(1, 6), len(range(1, 6)))
print(len(range(10000000)))
print(range(5) | reverse, range(5) | map((i) => i * 2))
```

```output
[] [] [] []
[1, 2, 3, 4, 5] 5
10000000
[4, 3, 2, 1, 0] [0, 2, 4, 6, 8]
```

### Errors

An argument that is not an int (a float, a string, nothing) is a runtime error, not
an error value, and so is a range of more than ten million numbers.

```quillo error
print(range(1.5))
```

```output
line 1: `range` expects an int as argument 1, got float
```

```quillo error
print(range(10000001))
```

```output
line 1: range is too large
```

### Chaining

`range` starts a pipeline: the numbers go on to a map, a filter or a sum. In a
pipeline its own arguments are the ends.

```quillo
print(range(1, 6) | map((x) => x * x) | sum)
print(range(10) | filter((x) => x % 3 == 0))
print(range(3) | map((i) => `item ${i + 1}`) | join(", "))
```

```output
55
[0, 3, 6, 9]
item 1, item 2, item 3
```

### See also

[enumerate](/docs/reference/enumerate/), [map](/docs/reference/map/), [take](/docs/reference/take/), [vec.arange](/docs/reference/vec.arange/), [vec.linspace](/docs/reference/vec.linspace/)
