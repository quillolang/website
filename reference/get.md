# get
get(map | null, any, any=) -> any
group: Maps

### What it does

The value under a key, or the default when the key is not in the map; without a
default, `null`. The key is turned into text first, as all map keys are, so
`get(m, 5)` reads `m["5"]`. It is `m[k]` as a function, useful in a pipeline and when
the map may be `null`.

### Examples

```quillo
let user = { name: "Ann", age: 41 }
print(get(user, "name"), get(user, "email"), get(user, "email", "none"))
print(get(user, "age") + 1)
```

```output
Ann null none
42
```

### Edge cases

- The default is for a missing key only: a key whose value is `null` gives `null`,
  not the default. `??` after `get` covers both.
- Keys are text: `get(m, 5)` and `get(m, "5")` read the same entry; a decimal key is
  read without its trailing zeros, so `1.50m` finds `"1.5"`.
- A `null` map is an empty map: `get(null, k, d)` is `d`, not an error.

```quillo
let m = { a: null, "5": "five", "1.5": "x" }
print(get(m, "a", 0), get(m, "a") ?? 0)
print(get(m, 5), get(m, 1.50m))
print(get(null, "a"), get(null, "a", "dflt"))
```

```output
null 0
five x
null dflt
```

### Errors

A map that is a list, a string or a number is a runtime error, not an error value.
For a list use `xs[i]`, `first` or `slice`.

```quillo error
print(get([1, 2], 0))
```

```output
line 1: `get` expects a map as argument 1, got list
```

### Chaining

In a pipeline the map comes first, so `get` takes the key as its argument:

```quillo
print(`{"a": 1}` | json.parse | get("a"))
let counts = ["x", "y", "x"] | reduce({}, (acc, w) => set(acc, w, get(acc, w, 0) + 1))
print(counts)
```

```output
1
{ x: 2, y: 1 }
```

### See also

[has](/docs/reference/has/), [set](/docs/reference/set/), [keys](/docs/reference/keys/), [values](/docs/reference/values/), [merge](/docs/reference/merge/)
