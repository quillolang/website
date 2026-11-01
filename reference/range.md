# range
range(int, int=, int=) -> list
group: Lists

### What it does

A list of ints. `range(n)` counts from `0` up to but not including `n`; `range(a, b)`
counts from `a` up to but not including `b`; `range(a, b, step)` takes every `step`th,
down when `step` is negative. `a..b` is `range(a, b)` written as an operator. In a `for`
that keeps no list, `for i in range(a, b)` counts without making one.

### Examples

```quillo
print(range(5))
print(range(2, 5))
print(range(-3, 1))
print(0..3)
for i in range(3) {
    print("row", i)
}
print(range(0, 10, 3), range(10, 0, -3), range(5, 0, -1))
```

```output
[0, 1, 2, 3, 4]
[2, 3, 4]
[-3, -2, -1, 0]
[0, 1, 2]
row 0
row 1
row 2
[0, 3, 6, 9] [10, 7, 4, 1] [5, 4, 3, 2, 1]
```

### Edge cases

- `range(0)`, a negative count, or an end at or before the start give `[]`: without a
  step it never counts down. With a negative step it does, and an end at or after the
  start gives `[]`.
- The end is not included: `range(1, 6)` is 1 to 5, and `range(a, b)` has `b - a`
  items.
- A list of at most ten million items; past that is a runtime error (see Errors). A
  loop whose list no one keeps (a `for` that is a statement) makes none, and goes past
  ten million.

```quillo
print(range(0), range(-2), range(5, 2), range(3, 3))
print(range(1, 6), len(range(1, 6)))
print(len(range(10000000)))
print(range(5) | reverse, range(5) | map((i) => i * 2))
print(range(0, 5, -1), range(3, 3, 2), range(0, 9, 4))
let n = 0
for i in range(0, 20000000) {
    n += 1
}
print(n)
```

```output
[] [] [] []
[1, 2, 3, 4, 5] 5
10000000
[4, 3, 2, 1, 0] [0, 2, 4, 6, 8]
[] [] [0, 4, 8]
20000000
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

```quillo error
print(range(0, 10, 0))
```

```output
line 1: `range`: a step of 0 never gets anywhere
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
