# remove
remove(list | map | null, any) -> list | map
group: Maps

### What it does

A new map without one key, or a new list without every item equal to a value. On a
map, `remove(m, k)` drops the entry under `k` (turned into text, as all map keys are)
and leaves the others in their order. On a list, `remove(xs, x)` drops each item that
`== x`. The original is not changed.

### Examples

```quillo
let user = { name: "Ann", age: 41, tmp: true }
let clean = remove(user, "tmp")
print(clean, user)
print(remove([1, 2, 1, 3], 1))
```

```output
{ name: "Ann", age: 41 } { name: "Ann", age: 41, tmp: true }
[2, 3]
```

### Edge cases

- A key that is not there changes nothing and is not an error.
- Keys are text: `remove(m, 5)` drops `"5"`.
- On a list, every equal item goes, not only the first; a value not in the list
  changes nothing.
- `null` as the map is an empty map and gives `{}`.

```quillo
let m = { "5": "five", a: 1 }
print(remove(m, "zz"), remove(m, 5))
print(remove(["a", "b", "a"], "a"), remove([1, 2], 9))
print(remove(null, "a"))
```

```output
{ "5": "five", a: 1 } { a: 1 }
["b"] [1, 2]
{}
```

### Errors

A string or a number as the first argument is a runtime error, not an error value;
for text use `replace`.

```quillo error
print(remove("abc", "a"))
```

```output
line 1: `remove` expects a map as argument 1, got str
```

### Chaining

```quillo
print({ a: 1, b: 2, c: 3 } | remove("b") | keys)
print([3, 1, 3, 2] | remove(3) | sort)
```

```output
["a", "c"]
[1, 2]
```

### See also

[set](/docs/reference/set/), [merge](/docs/reference/merge/), [filter](/docs/reference/filter/), [has](/docs/reference/has/), [replace](/docs/reference/replace/)
