# has
has(map | null, any) -> bool
group: Maps

### What it does

Whether a map has an entry under a key: `true` or `false`. The key is turned into
text first, as all map keys are. An entry whose value is `null` counts as present,
which is what tells `has` apart from `get(m, k) != null`.

### Examples

```quillo
let user = { name: "Ann", email: null }
print(has(user, "name"), has(user, "phone"))
print(has(user, "email"), get(user, "email") != null)
```

```output
true false
true false
```

### Edge cases

- Keys are text: `has(m, 5)` finds `"5"`.
- `null` as the map is an empty map: `has(null, k)` is `false`.
- `contains(m, k)` on a map asks the same question.

```quillo
let m = { "5": "five" }
print(has(m, 5), has(m, "5"), has(m, 6))
print(has(null, "a"), has({}, ""))
print(contains(m, "5"))
```

```output
true true false
false false
true
```

### Errors

A map that is not a map or `null` is a runtime error, not an error value. For a
list, `contains` looks for an item.

```quillo error
print(has(3, "a"))
```

```output
line 1: `has` expects a map as argument 1, got int
```

### Chaining

```quillo
let m = { a: 1, b: 2 }
print(m | has("a"))
print(["a", "x", "b"] | filter((k) => has(m, k)))
```

```output
true
["a", "b"]
```

### See also

[get](/docs/reference/get/), [keys](/docs/reference/keys/), [contains](/docs/reference/contains/), [set](/docs/reference/set/)
