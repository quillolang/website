# vec.full
vec.full(int, any) -> list
group: Vectors

### What it does

A list of `n` copies of a value. The value can be anything: a number, a string, `null`,
a map or a list.

### Examples

```quillo
print(vec.full(3, "x"))
print(vec.full(2, 2.5))
print(vec.full(2, [1]))
```

```output
["x", "x", "x"]
[2.5, 2.5]
[[1], [1]]
```

### Edge cases

- `n` of 0 is the empty list, whatever the value.
- A value left out is `null`, so `vec.full(2)` is `[null, null]`.
- A list value gives a list of lists, a matrix of one number when the value is a row.
- At most ten million items.

```quillo
print(vec.full(0, "x"), vec.full(2))
print(vec.full(2, vec.full(3, 0)))
```

```output
[] [null, null]
[[0, 0, 0], [0, 0, 0]]
```

### Errors

A negative count, or one over ten million, is a runtime error, not an error value; so is
a count that is not an int.

```quillo error
print(vec.full(-2, "x"))
```

```output
line 1: `vec.full`: -2 is not a count from 0 to 10000000
```

### Chaining

A baseline to compare a series against, and a filler for missing columns:

```quillo
let sales = [3, 5, 4]
print(vec.sub(sales, vec.full(3, 4)))
print(vec.full(3, 0.0) | vec.add(1))
```

```output
[-1, 1, 0]
[1.0, 1.0, 1.0]
```

### See also

[vec.zeros](/docs/reference/vec.zeros/), [vec.ones](/docs/reference/vec.ones/), [vec.arange](/docs/reference/vec.arange/), [range](/docs/reference/range/)
