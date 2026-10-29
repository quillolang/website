# first
first(list | null) -> any
group: Lists

### What it does

The first item of a list, or `null` when the list is empty. `null` counts as an empty
list. `xs[0]` is the same thing for a list that is known to have an item.

### Examples

```quillo
print(first([1, 2, 3]))
print(first(["ann", "bob"]))
print(first(split("k=v", "=")))
```

```output
1
ann
k
```

### Edge cases

- `first([])` and `first(null)` are `null`, not an error. Give a default with `??`.
- A first item that is `null` gives `null` too; check `len` when the difference
  matters.
- The item comes back as it is: a list inside a list stays a list.

```quillo
print(first([]), first(null), first([]) ?? 0)
print(first([null, 1]), len([null, 1]) > 0)
print(first([[1, 2], [3]]))
```

```output
null null 0
null true
[1, 2]
```

### Errors

An argument that is not a list or `null` is a runtime error, not an error value. A
string is not a list: use [take](/docs/reference/take/) or
[slice](/docs/reference/slice/) for its first characters.

```quillo error
print(first("abc"))
```

```output
line 1: `first` expects a list as argument 1, got str
```

### Chaining

In a pipeline `first` takes the list and needs no arguments: the smallest after a
sort, the first match after a filter.

```quillo
print([5, 3, 9] | sort | first)
print(["pear", "fig", "apple"] | sort_by(len) | first)
print([1, 2, 3] | filter((x) => x > 5) | first ?? "none")
```

```output
3
fig
none
```

### See also

[last](/docs/reference/last/), [find](/docs/reference/find/), [take](/docs/reference/take/), [slice](/docs/reference/slice/), [min](/docs/reference/min/)
