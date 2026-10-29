# vec.column
vec.column(list | null, str | int) -> list
group: Vectors

### What it does

One column out of a list of rows. With a string key, each row is a map and the result is
that field of every row, in order; with an int, each row is a list and the result is
that item of every row. A row without the field or the position gives `null` there. It
turns database rows into a list of numbers for `stats` and `vec`.

### Examples

```quillo
let orders = [{ name: "ann", total: 12.5 }, { name: "bob", total: 30 }]
print(vec.column(orders, "total"))
print(vec.column(orders, "name"))
print(vec.column([[1, 2], [3, 4]], 1))
```

```output
[12.5, 30]
["ann", "bob"]
[2, 4]
```

### Edge cases

- A missing field or a position past the row gives `null` in that place; filter the
  nulls out before arithmetic.
- A row of the wrong kind (a list under a string key, a map under an int, a plain
  value) gives `null` too, not an error.
- A negative position is `null`, not counted from the end.
- A string key reads maps only: an int key does not look up `"0"` in a map.
- The empty list, or `null`, gives the empty list.

```quillo
let orders = [{ name: "ann", total: 12.5 }, { name: "bob", total: 30 }, { name: "cy" }]
print(vec.column(orders, "total"), vec.column(orders, "missing"))
print(vec.column([[1, 2], [3, 4], [5]], 1), vec.column([[1, 2]], -1))
print(vec.column([{ a: 1 }, [1, 2], 7], "a"), vec.column([{ a: 1 }, [1, 2], 7], 0))
print(vec.column([{ "0": "z" }], 0))
print(vec.column([], "x"), vec.column(null, 0))
```

```output
[12.5, 30, null] [null, null, null]
[2, 4, null] [null]
[1, null, null] [null, 1, null]
[null]
[] []
```

### Errors

A key that is neither a string nor an int, or rows that are not a list, are runtime
errors, not error values.

```quillo error
print(vec.column([{ a: 1 }], null))
```

```output
line 1: `vec.column` expects a str or int key as argument 2, got null
```

```quillo error
print(vec.column("rows", "a"))
```

```output
line 1: `vec.column` expects a list as argument 1, got str
```

### Chaining

`rows | vec.column("total")` reads well in a pipeline, with the statistics after it:

```quillo
let orders = [{ name: "ann", total: 12.5 }, { name: "bob", total: 30 }, { name: "cy" }]
print(orders | vec.column("total") | filter((t) => t != null) | sum)
print(orders | vec.column("name") | join(", "))
```

```output
42.5
ann, bob, cy
```

### See also

[vec.transpose](/docs/reference/vec.transpose/), [map](/docs/reference/map/), [stats.describe](/docs/reference/stats.describe/), [vec.matmul](/docs/reference/vec.matmul/)
