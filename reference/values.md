# values
values(map | null) -> list
group: Maps

### What it does

The values of a map as a list, in the order the entries were added. Each value is
itself, whatever its type: a nested map or list is not copied or flattened. `null`
counts as an empty map and gives `[]`.

### Examples

```quillo
let prices = { apple: 2, pear: 3, fig: 5 }
print(values(prices))
print(values(prices) | sum)
```

```output
[2, 3, 5]
10
```

### Edge cases

- Order follows `keys`: `values(m)[i]` belongs to `keys(m)[i]`.
- A `null` value stays in the list; nothing is dropped.
- An empty map and `null` both give `[]`.

```quillo
let m = { a: [1], b: { c: 2 }, d: null }
print(values(m))
print(zip(keys(m), values(m)))
print(values({}), values(null))
```

```output
[[1], { c: 2 }, null]
[["a", [1]], ["b", { c: 2 }], ["d", null]]
[] []
```

### Errors

Anything but a map or `null` is a runtime error, not an error value.

```quillo error
print(values("ab"))
```

```output
line 1: `values` expects a map as argument 1, got str
```

### Chaining

```quillo
print({ a: 3, b: 1, c: 2 } | values | sort)
print({ a: 1, b: 2 } | values | map((v) => v * 10))
```

```output
[1, 2, 3]
[10, 20]
```

### See also

[keys](/docs/reference/keys/), [get](/docs/reference/get/), [zip](/docs/reference/zip/), [sum](/docs/reference/sum/)
