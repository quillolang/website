# group_by
group_by(list | null, fn) -> map
group: Lists

### What it does

A map from each key to the list of items with that key, the key being what the
function gives for the item. The keys are in the order they first appear, and so are
the items inside each group. A map's keys are text, so the key is written as text:
`1` and `"1"` are one key. `null` counts as an empty list and gives `{}`.

### Examples

```quillo
let orders = [{ id: 1, status: "paid" }, { id: 2, status: "open" }, { id: 3, status: "paid" }]
print(group_by(orders, (o) => o.status))
let by_status = group_by(orders, (o) => o.status)
print(keys(by_status), by_status.paid | map((o) => o.id))
for [status, os] in by_status {
    print(status, len(os))
}
print(group_by([1, 2, 3, 4, 5], (x) => x % 2 == 0 ? "even" : "odd"))
```

```output
{ paid: [{ id: 1, status: "paid" }, { id: 3, status: "paid" }], open: [{ id: 2, status: "open" }] }
["paid", "open"] [1, 3]
paid 2
open 1
{ odd: [1, 3, 5], even: [2, 4] }
```

### Edge cases

- An empty list or `null` gives `{}`.
- Keys become text: an int key `4` is `"4"`, a boolean `true` is `"true"`, `null` is
  `"null"`, and `1` and `"1"` fall in one group. A float `1.0` is written `"1.0"`, so it
  is a different key from `1`; a decimal is written without trailing zeros, so
  `1.50m` and `1.5m` share a key.
- A group that has no items is not there: reading it gives `null`. Use `get` with a
  default when `[]` is wanted.
- The order of keys is the order of first appearance; sort `keys` for another order.

```quillo
print(group_by([], (x) => x), group_by(null, (x) => x))
print(group_by(["pear", "fig", "apple"], len))
print(group_by([1, "1", 1.0, 2], (x) => x), group_by([3, 1, 2], (x) => x > 1))
print(group_by([dec("1.50"), dec("1.5")], (x) => x))
let g = group_by(["a"], (x) => x)
print(g.b, get(g, "b", []))
print(group_by(["b", "a", "b"], (x) => x) | keys | sort)
```

```output
{} {}
{ "4": ["pear"], "3": ["fig"], "5": ["apple"] }
{ "1": [1, "1"], "1.0": [1.0], "2": [2] } { true: [3, 2], false: [1] }
{ "1.5": [1.50m, 1.5m] }
null []
["a", "b"]
```

### Errors

A first argument that is not a list or `null`, or a second that is not a function, is
a runtime error, not an error value. An error inside the function stops the request.

```quillo error
print(group_by("ab", (c) => c))
```

```output
line 1: `group_by` expects a list as argument 1, got str
```

```quillo error
print(group_by([1, 2]))
```

```output
line 1: `group_by` expects a function as argument 2, got nothing
```

### Chaining

In a pipeline the list comes first and the key function is the only argument:
`xs | group_by(f)`. Walk the map with `for [key, items] in ...`, or `keys` and
`values` it, to total each group.

```quillo
let orders = [{ status: "paid", total: 10 }, { status: "open", total: 5 }, { status: "paid", total: 7 }]
for [status, os] in orders | group_by((o) => o.status) {
    print(status, os | map((o) => o.total) | sum)
}
print(orders | group_by((o) => o.status) | keys)
print(orders | group_by((o) => o.status) | values | map(len))
```

```output
paid 17
open 5
["paid", "open"]
[2, 1]
```

### See also

[count](/docs/reference/count/), [unique](/docs/reference/unique/), [sort_by](/docs/reference/sort_by/), [keys](/docs/reference/keys/), [values](/docs/reference/values/), [get](/docs/reference/get/), [join_on](/docs/reference/join_on/)
