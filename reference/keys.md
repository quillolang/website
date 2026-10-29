# keys
keys(map | null) -> list
group: Maps

### What it does

The keys of a map, as a list of strings, in the order the entries were added. A map's
keys are always text, so a key that was set with a number comes back as its text.
`null` counts as an empty map and gives `[]`.

### Examples

```quillo
let user = { name: "Ann", age: 41, admin: false }
print(keys(user))
print(keys({ "x y": 1, "2": 2 }))
```

```output
["name", "age", "admin"]
["x y", "2"]
```

### Edge cases

- Order is insertion order, not sorted: sort the list when an order is wanted.
- `set` on a key that is already there keeps its place; `remove` and `set` again
  puts it at the end.
- An empty map and `null` both give `[]`.
- `len(keys(m))` is `len(m)`.

```quillo
let m = { b: 2, a: 1, c: 3 }
print(keys(m), keys(m) | sort)
print(keys(set(m, "a", 10)), keys(set(remove(m, "a"), "a", 10)))
print(keys({}), keys(null))
print(len(keys(m)), len(m))
```

```output
["b", "a", "c"] ["a", "b", "c"]
["b", "a", "c"] ["b", "c", "a"]
[] []
3 3
```

### Errors

A list, a string or a number is a runtime error, not an error value: `keys` takes a
map or `null` only. A list has no keys; `enumerate` gives its positions.

```quillo error
print(keys([1, 2]))
```

```output
line 1: `keys` expects a map as argument 1, got list
```

### Chaining

In a pipeline the map comes first. There is no `entries`: `for [k, v] in m` walks a map
directly.

```quillo
print({ b: 1, a: 2 } | keys | map(upper))
for [k, v] in { a: 1, b: 2 } { print(k, v) }
```

```output
["B", "A"]
a 1
b 2
```

### See also

[values](/docs/reference/values/), [has](/docs/reference/has/), [get](/docs/reference/get/), [len](/docs/reference/len/), [sort](/docs/reference/sort/)
