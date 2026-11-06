# merge
merge(map | null, map | null) -> map
group: Maps

### What it does

One map made of two: every entry of the first, then every entry of the second, which
wins where both have a key. The result is a new map; neither argument changes. It is
`{ ...a, ...b }` as a function, for a pipeline or a `reduce`.

### Examples

```quillo
let defaults = { page: 1, size: 20, sort: "name" }
let query = { page: 3, sort: null }
print(merge(defaults, query))
print(defaults)
```

```output
{ page: 3, size: 20, sort: null }
{ page: 1, size: 20, sort: "name" }
```

### Edge cases

- The right side wins, `null` values included: a `null` on the right replaces a value
  on the left. Filter it out first when `null` means "not given".
- Order: keys of the first map in their order, then the new keys of the second;
  a key in both keeps the first map's position.
- `null` on either side is an empty map; `merge(null, null)` is `{}`.
- Only two maps: a third argument is a runtime error (below). Fold more with `reduce`.
- The order is the same in the browser, keys that look like numbers included:
  `merge({ b: 1 }, { "2": 2 })` is `{ b: 1, "2": 2 }` on both sides.

```quillo
print(merge({ a: 1, b: 2 }, { b: null }))
print(merge({ a: 1, b: 2 }, { c: 3, a: 0 }) | keys)
print(merge({ a: 1 }, null), merge(null, { a: 1 }), merge(null, null))
print([{ a: 1 }, { b: 2 }, { c: 3 }] | reduce({}, merge))
print(merge({ b: 1 }, { "2": 2 }) | keys)
```

```output
{ a: 1, b: null }
["a", "b", "c"]
{ a: 1 } { a: 1 } {}
{ a: 1, b: 2, c: 3 }
["b", "2"]
```

### Errors

An argument that is a list, a string or a number is a runtime error, not an error
value. Lists are joined with `[...a, ...b]`.

```quillo error
print(merge({ a: 1 }, [1]))
```

```output
line 1: `merge` expects a map as argument 2, got list
```

A third map is a runtime error, and one for `quillo check` when the call is written
out:

```quillo error
print(merge({ a: 1 }, { b: 2 }, { c: 3 }))
```

```output
line 1: `merge` takes 2 arguments, got 3: merge(a, b)
```

### Chaining

```quillo
let base = { color: "red", size: "m" }
print(base | merge({ size: "l" }))
print({ ...base, size: "l" } == merge(base, { size: "l" }))
```

```output
{ color: "red", size: "l" }
true
```

### See also

[set](/docs/reference/set/), [remove](/docs/reference/remove/), [get](/docs/reference/get/), [keys](/docs/reference/keys/), [reduce](/docs/reference/reduce/)
