# enumerate
enumerate(list | null) -> list
group: Lists

### What it does

A list of pairs `[index, item]`, one for each item, the index counting from `0`. It
gives a loop or a map the position along with the item. `null` counts as an empty list.

### Examples

```quillo
print(enumerate(["a", "b", "c"]))
for [i, name] in enumerate(["ann", "bob"]) {
    print(i, name)
}
print(enumerate(["a", "b"]) | map((p) => `${p[0] + 1}. ${p[1]}`))
```

```output
[[0, "a"], [1, "b"], [2, "c"]]
0 ann
1 bob
["1. a", "2. b"]
```

### Edge cases

- An empty list or `null` gives `[]`.
- Each pair is a two-item list, so `p[0]` is the index and `p[1]` the item, or
  `let [i, x] = p` takes it apart. A lambda has one parameter for the pair.
- Indexes start at 0, as `xs[i]` does; add 1 for numbering shown to people.
- A `null` item is paired like any other.

```quillo
print(enumerate([]), enumerate(null))
print(enumerate(["x"]) | map((p) => { let [i, x] = p
    `${i}=${x}` }))
print(enumerate([null]))
```

```output
[] []
["0=x"]
[[0, null]]
```

### Errors

An argument that is not a list or `null` is a runtime error, not an error value.
Split a string first to number its characters.

```quillo error
print(enumerate("ab"))
```

```output
line 1: `enumerate` expects a list as argument 1, got str
```

### Chaining

In a pipeline `enumerate` takes the list and needs no arguments; the pairs go on to a
map or a filter that reads the index.

```quillo
print(["a", "b", "c"] | enumerate | filter((p) => p[0] % 2 == 0) | map((p) => p[1]))
print(["a", "b"] | enumerate | map((p) => `${p[0]}:${p[1]}`) | join(" "))
print(split("abc", "") | enumerate)
```

```output
["a", "c"]
0:a 1:b
[[0, "a"], [1, "b"], [2, "c"]]
```

### See also

[range](/docs/reference/range/), [zip](/docs/reference/zip/), [map](/docs/reference/map/), [index_of](/docs/reference/index_of/)
