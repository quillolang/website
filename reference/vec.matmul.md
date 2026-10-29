# vec.matmul
vec.matmul(list, list) -> list
group: Vectors

### What it does

Matrix multiplication. A matrix is a list of rows, each a list of numbers of one length.
`a` with `n` rows and `k` columns times `b` with `k` rows and `m` columns gives `n` rows
of `m` floats. When `b` is a plain list of `k` numbers it is taken as a column, and the
result is a list of `n` floats. The result is always floats.

### Examples

```quillo
let a = [[1, 2], [3, 4]]
print(vec.matmul(a, [[5, 6], [7, 8]]))
print(vec.matmul(a, [1, 1]))
print(vec.matmul([[1, 2, 3]], [[1], [2], [3]]))
```

```output
[[19.0, 22.0], [43.0, 50.0]]
[3.0, 7.0]
[[14.0]]
```

### Edge cases

- Ints come back as floats: the identity times `[[1, 2], [3, 4]]` is
  `[[1.0, 2.0], [3.0, 4.0]]`, which still equals `a`, since `1 == 1.0`.
- A column times a row is their outer product.
- Two empty matrices, or `null` for both, give the empty list.
- A row of numbers as `a` is not a matrix: wrap it, `[[1, 2]]`.

```quillo
let a = [[1, 2], [3, 4]]
print(vec.matmul(a, [[1, 0], [0, 1]]), vec.matmul(a, [[1, 0], [0, 1]]) == a)
print(vec.matmul([[1], [2]], [[1, 2, 3]]))
print(vec.matmul([], []), vec.matmul(null, null))
```

```output
[[1.0, 2.0], [3.0, 4.0]] true
[[1.0, 2.0, 3.0], [2.0, 4.0, 6.0]]
[] []
```

### Errors

Shapes that do not fit (the columns of `a` against the rows of `b`, or the length of the
column), rows of different lengths, an item that is not a number, and an `a` that is not
a list of lists are runtime errors, not error values.

```quillo error
print(vec.matmul([[1, 2]], [[1, 2]]))
```

```output
line 1: `vec.matmul`: a has 2 columns, b has 1 rows
```

```quillo error
print(vec.matmul([1, 2], [[1], [2]]))
```

```output
line 1: `vec.matmul` expects a list of rows, but row 0 is int
```

### Chaining

In a pipeline the left side is `a`, the matrix: `weights | vec.matmul(inputs)` applies
a linear model with two weights per output to a column of inputs.

```quillo
let weights = [[0.5, 1], [2, -1]]
print(weights | vec.matmul([3, 4]))
print(weights | vec.matmul(vec.transpose(weights)))
```

```output
[5.5, 2.0]
[[1.25, 0.0], [0.0, 5.0]]
```

### See also

[vec.transpose](/docs/reference/vec.transpose/), [vec.dot](/docs/reference/vec.dot/), [vec.column](/docs/reference/vec.column/), [vec.mul](/docs/reference/vec.mul/)
