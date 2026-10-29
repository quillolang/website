# find
find(list | null, fn) -> any
group: Lists

### What it does

The first item for which the function gives a true value, or `null` when none does.
The function takes one argument, the item, and is called in order until it says yes;
the rest of the list is not looked at. `null` counts as an empty list.

### Examples

```quillo
print(find([1, 2, 3], (x) => x > 1))
let people = [{ id: 1, name: "Ann" }, { id: 2, name: "Bo" }]
print(find(people, (p) => p.id == 2))
print(find(people, (p) => p.id == 2).name)
print(find(["a", "bb", "ccc"], (s) => len(s) > 1))
```

```output
2
{ id: 2, name: "Bo" }
Bo
bb
```

### Edge cases

- Nothing found, an empty list or `null` gives `null`. Give a default with `??`.
- Only the first match comes back; for all of them use
  [filter](/docs/reference/filter/).
- The search stops at the first match: the function is not called for the items after it.
- A `null` item that matches gives `null` too, which cannot be told from "not found".
  Use [any](/docs/reference/any/) when the question is only whether it is there.

```quillo
print(find([1, 2, 3], (x) => x > 5), find([], (x) => true), find(null, (x) => true))
print(find([1, 2], (x) => x > 5) ?? "none")
print(find([1, 2, 3], (x) => { print("trying", x)
    x == 2 }))
print(find([null, 1], (x) => x == null), any([null, 1], (x) => x == null))
```

```output
null null null
none
trying 1
trying 2
2
null true
```

### Errors

A first argument that is not a list or `null`, or a second that is not a function, is
a runtime error, not an error value. An error inside the function stops the request.
A missing match is not an error: it is `null`.

```quillo error
print(find("abc", (c) => c == "b"))
```

```output
line 1: `find` expects a list as argument 1, got str
```

```quillo error
print(find([1, 2], 2))
```

```output
line 1: `find` expects a function as argument 2, got int
```

### Chaining

In a pipeline the list comes first: `xs | find(f)`. A field of the result can be read
at once; when nothing was found that field is `null` too, since a field of `null` is
`null`.

```quillo
let users = [{ id: 1, name: "Ann" }, { id: 2, name: "Bo" }]
print(users | find((u) => u.id == 1) | get("name"))
print((users | find((u) => u.id == 9)).name)
print(users | map((u) => u.name) | find((n) => starts_with(n, "B")))
```

```output
Ann
null
Bo
```

### See also

[filter](/docs/reference/filter/), [any](/docs/reference/any/), [first](/docs/reference/first/), [index_of](/docs/reference/index_of/), [contains](/docs/reference/contains/)
