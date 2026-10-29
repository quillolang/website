# vec.div
vec.div(list | num, list | num) -> any
group: Vectors

### What it does

Divides item by item: two lists of the same length give a list of their pairwise
quotients, a list and a number give the list with each item divided by the number, and
a number and a list give the number divided by each item. As with the `/` operator, two
ints give an int when the division is exact and a float otherwise; floats give floats.

### Examples

```quillo
print(vec.div([10, 20, 7], 2))
print(vec.div([1, 2], [4, 4]))
print(vec.div(1, [2, 4]))
```

```output
[5, 10, 3.5]
[0.25, 0.5]
[0.5, 0.25]
```

### Edge cases

- An int result is an int only where the division is exact: `[10, 20, 7]` by 2 is
  `[5, 10, 3.5]`.
- A float divided by zero is `inf`, `-inf` or `NaN` as in float arithmetic, not an
  error; it is dividing an int by an int zero that fails.
- The empty list gives the empty list.

```quillo
print(vec.div([10, 20, 7], 2))
print(vec.div([1, -1, 0], 0.0))
print(vec.div([1.0, 2.0], 0))
print(vec.div([], 2))
```

```output
[5, 10, 3.5]
[inf, -inf, NaN]
[inf, inf]
[]
```

### Errors

An int divided by an int zero, in any item, is a `division by zero` runtime error, not
an error value. Lists of different lengths, an item that is not an int or a float, or
an argument that is neither a list nor a number are runtime errors too.

```quillo error
print(vec.div([1, 2], 0))
```

```output
line 1: `vec.div`: division by zero
```

```quillo error
print(vec.div([1, 2, 3], [1, 2]))
```

```output
line 1: `vec.div` needs lists of the same length (3 and 2)
```

### Chaining

`xs | vec.div(k)` divides each item; a column of totals becomes shares of the sum:

```quillo
let totals = [2, 6, 2]
print(totals | vec.div(sum(totals)))
print(vec.column([{ v: 2 }, { v: 4 }], "v") | vec.div(2))
```

```output
[0.2, 0.6, 0.2]
[1, 2]
```

### See also

[vec.mul](/docs/reference/vec.mul/), [vec.mod](/docs/reference/vec.mod/), [vec.add](/docs/reference/vec.add/), [stats.normalize](/docs/reference/stats.normalize/)
