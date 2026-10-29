# set
set(map | list | null, any, any=) -> map | list
group: Maps

### What it does

A new map with one entry set, or a new list with one item replaced. On a map,
`set(m, k, v)` puts `v` under the key `k` (turned into text, as all map keys are),
adding the entry at the end or replacing the value in place. On a list, `set(xs, i, v)`
replaces the item at position `i`, counted from the end when negative. Values never
change: the original map or list stays as it was.

### Examples

```quillo
let user = { name: "Ann" }
let older = set(user, "age", 41)
print(older, user)
print(set(older, "name", "Bob"))
print(set([1, 2, 3], 1, "b"), set([1, 2, 3], -1, "z"))
```

```output
{ name: "Ann", age: 41 } { name: "Ann" }
{ name: "Bob", age: 41 }
[1, "b", 3] [1, 2, "z"]
```

### Edge cases

- A key already there keeps its position; a new key goes last.
- Any key becomes text: `5` sets `"5"`, `true` sets `"true"`, a decimal drops its
  trailing zeros (`1.50m` sets `"1.5"`), a list sets its text.
- Without a value, the entry is set to `null` and `has` still finds it.
- `null` as the map is an empty map.
- Built up in a loop or in `reduce`, a map no one else holds is changed in place, so a
  map of thousands of entries costs milliseconds.

```quillo
let m = { b: 2, a: 1 }
print(set(m, "a", 10), set(m, 5, "five"), set(m, 1.50m, "x"))
print(set(m, "c"), has(set(m, "c"), "c"))
print(set(null, "a", 1))
print(range(5) | reduce({}, (acc, i) => set(acc, i, i * i)))
```

```output
{ b: 2, a: 10 } { b: 2, a: 1, "5": "five" } { b: 2, a: 1, "1.5": "x" }
{ b: 2, a: 1, c: null } true
{ a: 1 }
{ "0": 0, "1": 1, "2": 4, "3": 9, "4": 16 }
```

### Errors

A list index past either end is a runtime error, not an error value: `push` adds an
item. A list index that is not an int, and a first argument that is not a map, a
list or `null`, are runtime errors too.

```quillo error
print(set([1, 2], 5, 0))
```

```output
line 1: `set`: index 5 is outside a list of 2
```

### Chaining

In a pipeline the map or list comes first:

```quillo
print({ a: 1 } | set("b", 2) | set("c", 3))
print([0, 0, 0] | set(1, 9))
```

```output
{ a: 1, b: 2, c: 3 }
[0, 9, 0]
```

### See also

[get](/docs/reference/get/), [remove](/docs/reference/remove/), [merge](/docs/reference/merge/), [has](/docs/reference/has/), [push](/docs/reference/push/)
