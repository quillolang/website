# flatten
flatten(list | null) -> list
group: Lists

### What it does

One list from a list of lists: the items of each inner list, in order, one level deep.
An item that is not a list is kept as it is. `null` counts as an empty list.

### Examples

```quillo
print(flatten([[1, 2], [3], []]))
let teams = [{ members: ["ann", "bob"] }, { members: ["cy"] }]
print(flatten(map(teams, (t) => t.members)))
print(flatten([[1, [2, 3]], 4, "a"]))
```

```output
[1, 2, 3]
["ann", "bob", "cy"]
[1, [2, 3], 4, "a"]
```

### Edge cases

- An empty list, a list of empty lists, or `null` gives `[]`.
- Only one level: a list inside an inner list stays a list. Call `flatten` again for
  the next level.
- Items that are not lists pass through unchanged, so a mixed list is fine.
- A `for` block in a template gives a list per round; `flatten` makes it one list.

```quillo
print(flatten([]), flatten([[], []]), flatten(null))
print(flatten([[[1]], [[2]]]), flatten([[[1]], [[2]]]) | flatten)
print(flatten([1, null, [2]]))
```

```output
[] [] []
[[1], [2]] [1, 2]
[1, null, 2]
```

### Errors

An argument that is not a list or `null` is a runtime error, not an error value.

```quillo error
print(flatten("ab"))
```

```output
line 1: `flatten` expects a list as argument 1, got str
```

### Chaining

In a pipeline `flatten` takes the list and needs no arguments. After a
[map](/docs/reference/map/) that gives a list per item it is a flat map.

```quillo
print([[1, 2], [3]] | flatten | sum)
print(["a b", "c"] | map((s) => split(s, " ")) | flatten)
print(range(3) | map((i) => [i, i]) | flatten)
```

```output
6
["a", "b", "c"]
[0, 0, 1, 1, 2, 2]
```

### See also

[map](/docs/reference/map/), [zip](/docs/reference/zip/), [push](/docs/reference/push/), [join](/docs/reference/join/)
