# zip
zip(list | null, list | null) -> list
group: Lists

### What it does

Pairs the two lists item by item: a list of `[a, b]` lists, the first of each, then
the second, and so on, as long as the shorter list. `null` counts as an empty list.

### Examples

```quillo
print(zip([1, 2, 3], ["a", "b", "c"]))
let names = ["ann", "bob"]
let ages = [30, 40]
for [name, age] in zip(names, ages) {
    print(name, age)
}
print(zip(names, ages) | map((p) => { name: p[0], age: p[1] }))
```

```output
[[1, "a"], [2, "b"], [3, "c"]]
ann 30
bob 40
[{ name: "ann", age: 30 }, { name: "bob", age: 40 }]
```

### Edge cases

- The result is as long as the shorter list; the extra items of the longer one are
  dropped without an error.
- Either list empty or `null` gives `[]`.
- Each pair is a two-item list: `p[0]`, `p[1]`, or `let [a, b] = p`.
- Pairing a list with its indexes is [enumerate](/docs/reference/enumerate/).

```quillo
print(zip([1, 2, 3], ["a"]), zip([], [1]), zip(null, [1]), zip([1], null))
print(zip(["a", "b"], range(2)), enumerate(["a", "b"]))
```

```output
[[1, "a"]] [] [] []
[["a", 0], ["b", 1]] [[0, "a"], [1, "b"]]
```

### Errors

An argument that is not a list or `null` is a runtime error, not an error value.

```quillo error
print(zip([1], "ab"))
```

```output
line 1: `zip` expects a list as argument 2, got str
```

### Chaining

In a pipeline the first list comes first and the second is the only argument:
`xs | zip(ys)`. The pairs go on to a map that combines them.

```quillo
print([1, 2, 3] | zip([10, 20, 30]) | map((p) => p[0] + p[1]))
print(["x", "y"] | zip([1, 2]) | map((p) => `${p[0]}=${p[1]}`) | join("&"))
```

```output
[11, 22, 33]
x=1&y=2
```

### See also

[enumerate](/docs/reference/enumerate/), [map](/docs/reference/map/), [flatten](/docs/reference/flatten/), [range](/docs/reference/range/)
