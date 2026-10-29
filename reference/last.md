# last
last(list | null) -> any
group: Lists

### What it does

The last item of a list, or `null` when the list is empty. `null` counts as an empty
list. `xs[-1]` is the same thing for a list that is known to have an item.

### Examples

```quillo
print(last([1, 2, 3]))
print(last(["ann", "bob"]))
print(last(split("a/b/c.txt", "/")))
```

```output
3
bob
c.txt
```

### Edge cases

- `last([])` and `last(null)` are `null`, not an error. Give a default with `??`.
- A last item that is `null` gives `null` too; check `len` when the difference
  matters.
- A list of one item: its first and last are the same item.

```quillo
print(last([]), last(null), last(null) ?? "empty")
print(last([1, null]), len([1, null]))
print(last([7]) == first([7]))
```

```output
null null empty
null 2
true
```

### Errors

An argument that is not a list or `null` is a runtime error, not an error value. A
string is not a list: use [slice](/docs/reference/slice/) with a negative start for
its last characters.

```quillo error
print(last("abc"))
```

```output
line 1: `last` expects a list as argument 1, got str
```

### Chaining

In a pipeline `last` takes the list and needs no arguments: the largest after a sort,
the newest of a list in order of time.

```quillo
print([5, 3, 9] | sort | last)
print(["pear", "fig", "apple"] | sort_by(len) | last)
print("a.tar.gz" | split(".") | last)
```

```output
9
apple
gz
```

### See also

[first](/docs/reference/first/), [max](/docs/reference/max/), [drop](/docs/reference/drop/), [slice](/docs/reference/slice/), [reverse](/docs/reference/reverse/)
