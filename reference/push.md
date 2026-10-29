# push
push(list | null, any=) -> list
group: Lists

### What it does

A new list with one item added at the end. Values never change in Quillo, so the list
given stays as it was and the longer list is the result: assign it back
(`xs = xs | push(v)`) to keep it. `null` counts as an empty list.

### Examples

```quillo
print(push([1, 2], 3))
let todos = ["milk"]
todos = todos | push("eggs")
print(todos)
print(push([], { id: 1 }))
```

```output
[1, 2, 3]
["milk", "eggs"]
[{ id: 1 }]
```

### Edge cases

- The original is unchanged: after `let b = push(a, 3)`, `a` is as it was.
- `push(null, x)` gives `[x]`, so a list that may still be null needs no check.
- Only one item is added, as it is: pushing a list adds it as one nested item. Use
  `+` to join two lists.
- The item left out is `null`: `push(xs)` adds a `null`.

```quillo
let a = [1, 2]
let b = push(a, 3)
print(a, b)
print(push(null, 1), push([1], [2, 3]), [1] + [2, 3])
print(push([1]), push([1], null))
```

```output
[1, 2] [1, 2, 3]
[1] [1, [2, 3]] [1, 2, 3]
[1, null] [1, null]
```

### Errors

A first argument that is not a list or `null` is a runtime error, not an error value:
a string is not a list of its characters, and a map is not a list.

```quillo error
print(push("a", "b"))
```

```output
line 1: `push` expects a list as argument 1, got str
```

### Chaining

In a pipeline the list comes first and the item is the only argument: `xs | push(v)`.
Building a list item by item is a [reduce](/docs/reference/reduce/) whose value so far
is a list.

```quillo
print([] | push(1) | push(2))
print(reduce([1, 2, 3], [], (acc, x) => push(acc, x * 2)))
let parts = ["a"]
for p in ["b", "c"] {
    parts = parts | push(p)
}
print(join(parts, "-"))
```

```output
[1, 2]
[2, 4, 6]
a-b-c
```

### See also

[reduce](/docs/reference/reduce/), [set](/docs/reference/set/), [remove](/docs/reference/remove/), [flatten](/docs/reference/flatten/), [join](/docs/reference/join/)
