# sort_by
sort_by(list | null, fn) -> list
group: Lists

### What it does

The items in ascending order of a key, as a new list. The function takes one argument,
the item, and gives its key: a number or a string. The sort is stable: items with equal
keys keep their order. There is no descending flag; negate a numeric key or
[reverse](/docs/reference/reverse/) the result. `null` counts as an empty list.

### Examples

```quillo
let people = [{ name: "Cy", age: 30 }, { name: "Ann", age: 25 }, { name: "Bo", age: 30 }]
print(sort_by(people, (p) => p.age))
print(sort_by(people, (p) => p.name) | map((p) => p.name))
print(sort_by(["bb", "a", "ccc"], len))
print(sort_by(["Bob", "alice", "Carl"], lower))
```

```output
[{ name: "Ann", age: 25 }, { name: "Cy", age: 30 }, { name: "Bo", age: 30 }]
["Ann", "Bo", "Cy"]
["a", "bb", "ccc"]
["alice", "Bob", "Carl"]
```

### Edge cases

- An empty list or `null` gives `[]`. The list given is not changed.
- Stable: `Cy` and `Bo` both have age 30 and stay in that order; a sort by a second
  key after a sort by the first keeps the first's order within equal keys.
- Descending: negate a numeric key, or reverse the result (which also reverses the
  order of equal keys).
- The key is read once per item, then the keys are compared as
  [sort](/docs/reference/sort/) compares: numbers as numbers, strings by code point.

```quillo
print(sort_by([], (x) => x), sort_by(null, (x) => x))
let people = [{ name: "Cy", age: 30 }, { name: "Ann", age: 25 }, { name: "Bo", age: 30 }]
print(sort_by(people, (p) => p.age) | map((p) => p.name))
print(sort_by(people, (p) => -p.age) | map((p) => p.name))
print(sort_by(people, (p) => p.age) | reverse | map((p) => p.name))
print(sort_by(people, (p) => p.name) | sort_by((p) => p.age) | map((p) => p.name))
```

```output
[] []
["Ann", "Cy", "Bo"]
["Cy", "Bo", "Ann"]
["Bo", "Cy", "Ann"]
["Ann", "Bo", "Cy"]
```

### Errors

A list that is not a list or `null`, or a key function that is not a function, is a
runtime error, not an error value. Keys that do not order are a runtime error too: a
missing field gives `null` as the key, and a string key beside a number is as bad.

```quillo error
print(sort_by([{ a: 1 }, { b: 2 }], (m) => m.a))
```

```output
line 1: `sort_by` cannot compare null with int
```

```quillo error
print(sort_by([{ n: "1" }, { n: 2 }], (m) => m.n))
```

```output
line 1: `sort_by` cannot compare int with str
```

```quillo error
print(sort_by([1, 2], 3))
```

```output
line 1: `sort_by` expects a function as argument 2, got int
```

### Chaining

In a pipeline the list comes first and the key function is the only argument:
`xs | sort_by(f)`. It takes the place of a comparator: for the item with the smallest
or largest key, take the first or the last.

```quillo
let orders = [{ id: 1, total: 30 }, { id: 2, total: 12 }, { id: 3, total: 21 }]
print(orders | sort_by((o) => o.total) | map((o) => o.id))
print(orders | sort_by((o) => o.total) | first)
print(orders | sort_by((o) => o.total) | reverse | take(2) | map((o) => o.id))
```

```output
[2, 3, 1]
{ id: 2, total: 12 }
[1, 3]
```

### See also

[sort](/docs/reference/sort/), [reverse](/docs/reference/reverse/), [min](/docs/reference/min/), [max](/docs/reference/max/), [group_by](/docs/reference/group_by/), [vec.argsort](/docs/reference/vec.argsort/)
