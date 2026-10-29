# vec.sub
vec.sub(list | num, list | num) -> any
group: Vectors

### What it does

Subtracts item by item: two lists of the same length give a list of their pairwise
differences, a list and a number give the list with the number taken from each item,
and a number and a list give the number less each item. Ints stay ints, floats stay
floats, as with the `-` operator. Two numbers give their difference.

### Examples

```quillo
print(vec.sub([10, 20, 30], [1, 2, 3]))
print(vec.sub([10, 20, 30], 5))
print(vec.sub(100, [10, 20, 30]))
print(vec.sub([1, 2], [0.5, 0.5]))
```

```output
[9, 18, 27]
[5, 15, 25]
[90, 80, 70]
[0.5, 1.5]
```

### Edge cases

- Order matters: `vec.sub(a, b)` is `a - b` item by item, so `vec.sub(5, [1, 2])` is
  `[4, 3]`, not `[-4, -3]`.
- The empty list gives the empty list.
- Taking the mean from each item centres a list; the result is floats when the mean is.

```quillo
print(vec.sub(5, [1, 2]), vec.sub([1, 2], 5))
print(vec.sub([], 1))
let sales = [3, 5, 4, 6, 8]
print(vec.sub(sales, stats.mean(sales)))
```

```output
[4, 3] [-4, -3]
[]
[-2.2, -0.20000000000000018, -1.2000000000000002, 0.7999999999999998, 2.8]
```

### Errors

Lists of different lengths, an item that is not an int or a float, or an argument that
is neither a list nor a number are runtime errors, not error values. An int result past
64 bits is an `integer overflow` runtime error.

```quillo error
print(vec.sub([1, 2], [1, 2, 3]))
```

```output
line 1: `vec.sub` needs lists of the same length (2 and 3)
```

```quillo error
print(vec.sub([1, "2"], 1))
```

```output
line 1: `vec.sub` expects numbers, got str and int
```

### Chaining

The left side is what is subtracted from: `xs | vec.sub(1)` takes 1 from each item.

```quillo
let sales = [3, 5, 4, 6, 8]
print(sales | vec.sub(stats.mean(sales)) | vec.round(2))
print(vec.norm(vec.sub([1, 1], [4, 5])))
```

```output
[-2.2, -0.2, -1.2, 0.8, 2.8]
5.0
```

### See also

[vec.add](/docs/reference/vec.add/), [vec.diff](/docs/reference/vec.diff/), [vec.abs](/docs/reference/vec.abs/), [stats.zscore](/docs/reference/stats.zscore/), [math.dist](/docs/reference/math.dist/)
