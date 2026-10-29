# unique
unique(list | null) -> list
group: Lists

### What it does

The list without repeats: the first of each group of equal items, in the order they
first appear. Equal is what `==` says, so `1`, `1.0` and `dec("1.0")` are one item,
and a map or a list equals another with the same contents. `null` counts as an empty
list.

### Examples

```quillo
print(unique([1, 2, 1, 3, 2]))
print(unique(["ann", "bob", "ann"]))
let orders = [{ user: "ann" }, { user: "bob" }, { user: "ann" }]
print(unique(map(orders, (o) => o.user)))
```

```output
[1, 2, 3]
["ann", "bob"]
["ann", "bob"]
```

### Edge cases

- An empty list or `null` gives `[]`.
- Numbers equal across types: `[1, 1.0, dec("1.00")]` keeps only the first, `1`. The
  string `"1"` is a different value.
- Strings compare exactly: `"a"` and `"A"` are two items.
- `null` is a value: several nulls become one.
- Lists and maps are compared by contents, so two equal maps become one. Each item is
  compared with every item kept so far, which is fine for hundreds, slow for a million.

```quillo
print(unique([]), unique(null))
print(unique([1, 1.0, dec("1.00"), "1"]))
print(unique(["a", "A", "a"]), unique([null, null, 1]))
print(unique([[1, 2], [1, 2], { a: 1 }, { a: 1 }]))
```

```output
[] []
[1, "1"]
["a", "A"] [null, 1]
[[1, 2], { a: 1 }]
```

### Errors

An argument that is not a list or `null` is a runtime error, not an error value;
split a string first to get its distinct characters.

```quillo error
print(unique("aab"))
```

```output
line 1: `unique` expects a list as argument 1, got str
```

### Chaining

In a pipeline `unique` takes the list and needs no arguments. Sort after it for an
ordered set, count it for the number of distinct values.

```quillo
print([3, 1, 3, 2] | unique | sort)
print(["b", "a", "b"] | unique | len)
print(split("hello", "") | unique | join(""))
```

```output
[1, 2, 3]
2
helo
```

### See also

[filter](/docs/reference/filter/), [sort](/docs/reference/sort/), [group_by](/docs/reference/group_by/), [contains](/docs/reference/contains/), [count](/docs/reference/count/)
