# vec.transpose
vec.transpose(list | null) -> list
group: Vectors

### What it does

Rows turned into columns: for a list of rows of one length, a list of the columns, each
the items at one position of every row. The items can be anything, not only numbers;
they are moved, not converted.

### Examples

```quillo
print(vec.transpose([[1, 2, 3], [4, 5, 6]]))
print(vec.transpose([["a", 1], ["b", 2]]))
```

```output
[[1, 4], [2, 5], [3, 6]]
[["a", "b"], [1, 2]]
```

### Edge cases

- One row of `n` items gives `n` rows of one item, and back.
- The empty list, or `null`, gives the empty list; so does one empty row, since there are
  no columns.
- Transposing twice gives the original.
- Items keep their values and types: strings, `null` and booleans travel as they are.

```quillo
print(vec.transpose([[1, 2, 3]]), vec.transpose([[1], [2], [3]]))
print(vec.transpose([]), vec.transpose(null), vec.transpose([[]]))
print(vec.transpose(vec.transpose([[1, 2], [3, 4]])))
print(vec.transpose([["a", 1], [null, true]]))
```

```output
[[1], [2], [3]] [[1, 2, 3]]
[] [] []
[[1, 2], [3, 4]]
[["a", null], [1, true]]
```

### Errors

Rows of different lengths, or a row that is not a list, are runtime errors, not error
values.

```quillo error
print(vec.transpose([[1, 2], [3]]))
```

```output
line 1: `vec.transpose`: row 1 has 1 items, row 0 has 2
```

```quillo error
print(vec.transpose([1, 2]))
```

```output
line 1: `vec.transpose` expects a list of rows, but row 0 is int
```

### Chaining

Column totals of a table of rows, and pairs of lists turned into a list of pairs:

```quillo
let table = [[1, 2], [3, 4], [5, 6]]
print(table | vec.transpose | map(sum))
print(vec.transpose([["x", "y"], [10, 20]]))
```

```output
[9, 12]
[["x", 10], ["y", 20]]
```

### See also

[vec.matmul](/docs/reference/vec.matmul/), [vec.column](/docs/reference/vec.column/), [zip](/docs/reference/zip/), [map](/docs/reference/map/)
