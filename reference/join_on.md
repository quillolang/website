# join_on
join_on(list | null, list | null, str, str | null=, str | null=) -> list
group: Lists

### What it does

Joins two lists of rows (maps) on a key, as a left join: each row of the first list
comes back with one more field holding its match from the second list, or `null` when
there is none. `join_on(rows, others, key, other_key, as)`: a row matches the first of
`others` whose `other_key` equals the row's `key`, same value and same type.
`other_key` left out or `null` is `key`; `as`, the field the match is put under, left
out is `key` without its `_id` ending (`user_id` gives `user`), else `"joined"`. It
is how rows from two databases are put together, which no single SQL query can do.

### Examples

```quillo
let orders = [{ id: 1, user_id: 7 }, { id: 2, user_id: 9 }, { id: 3, user_id: 7 }]
let users = [{ id: 7, name: "Ann" }, { id: 9, name: "Bo" }]
print(join_on(orders, users, "user_id", "id"))
print(join_on(orders, users, "user_id", "id") | map((o) => o.user.name))
print(join_on(orders, users, "user_id", "id", "buyer") | first)
print(join_on([{ code: "a" }], [{ code: "a", v: 1 }], "code"))
```

```output
[{ id: 1, user_id: 7, user: { id: 7, name: "Ann" } }, { id: 2, user_id: 9, user: { id: 9, name: "Bo" } }, { id: 3, user_id: 7, user: { id: 7, name: "Ann" } }]
["Ann", "Bo", "Ann"]
{ id: 1, user_id: 7, buyer: { id: 7, name: "Ann" } }
[{ code: "a", joined: { code: "a", v: 1 } }]
```

```quillo noexec
let orders = db.query("select * from orders where day = ?", today)
let people = accounts.query("select * from users where id = any(?)", orders | map((o) => o.user_id))
join_on(orders, people, "user_id", "id")
```

### Edge cases

- Every row of the first list comes back, once, in its order; a row with no match has
  `null` under `as`. Filter on that field for an inner join.
- The key must be the same value and the same type: `1` does not match `"1"` nor
  `1.0`. Convert with `int` or `str` first when the two databases store it differently.
- Several matches: the first one in `others` is used.
- A row without the key field, or whose key is `null`, matches an other whose key is
  `null` if there is one, else gets `null`.
- A field already named `as` in a row is replaced.
- Items of `others` that are not maps are skipped; an empty or `null` `others` gives
  every row `null`. An empty or `null` first list gives `[]`.
- The default name: `owner` has no `_id`, so the match goes under `joined`.

```quillo
let users = [{ id: 7, name: "Ann" }]
print(join_on([{ user_id: 7 }, { user_id: 8 }], users, "user_id", "id"))
print(join_on([{ user_id: 7 }, { user_id: 8 }], users, "user_id", "id") | filter((o) => o.user != null) | len)
print(join_on([{ user_id: 1 }], [{ id: "1", n: "text" }, { id: 1, n: "int" }], "user_id", "id"))
print(join_on([{ user_id: 1 }], [{ id: 1.0 }], "user_id", "id"))
print(join_on([{ user_id: 7 }], [{ id: 7, n: "first" }, { id: 7, n: "second" }], "user_id", "id"))
print(join_on([{ id: 1 }], users, "user_id", "id"), join_on([{ user_id: null }], [{ id: null, n: "nil" }], "user_id", "id"))
print(join_on([{ user_id: 7, user: "old" }], users, "user_id", "id"))
print(join_on([{ user_id: 7 }], null, "user_id", "id"), join_on(null, users, "user_id", "id"))
print(join_on([{ owner: 7 }], users, "owner", "id"), join_on([{ user_id: 7 }], users, "user_id", null, "u"))
```

```output
[{ user_id: 7, user: { id: 7, name: "Ann" } }, { user_id: 8, user: null }]
1
[{ user_id: 1, user: { id: 1, n: "int" } }]
[{ user_id: 1, user: null }]
[{ user_id: 7, user: { id: 7, n: "first" } }]
[{ id: 1, user: null }] [{ user_id: null, user: { id: null, n: "nil" } }]
[{ user_id: 7, user: { id: 7, name: "Ann" } }]
[{ user_id: 7, user: null }] []
[{ owner: 7, joined: { id: 7, name: "Ann" } }] [{ user_id: 7, u: null }]
```

### Errors

A list that is not a list or `null`, a key that is not a string, or a fourth or fifth
argument that is neither a string nor `null`, is a runtime error, not an error value.
So is a row in the first list that is not a map. The key is required.

```quillo error
print(join_on([1], [{ id: 1 }], "id"))
```

```output
line 1: `join_on` joins maps (rows), got int
```

```quillo error
print(join_on([{ a: 1 }], [{ a: 1 }], "a", 2))
```

```output
line 1: `join_on`'s fourth argument is the others' key (a str), got int
```

```quillo error
print(join_on([{ a: 1 }], [{ a: 1 }]))
```

```output
line 1: `join_on` expects a str as argument 3, got nothing
```

### Chaining

In a pipeline the rows come first and the other list and the keys follow:
`rows | join_on(others, key, other_key)`. The joined rows go on to a map, a filter or
a sort by a field of the match.

```quillo
let orders = [{ id: 1, user_id: 9 }, { id: 2, user_id: 7 }]
let users = [{ id: 7, name: "Ann" }, { id: 9, name: "Bo" }]
print(orders | join_on(users, "user_id", "id") | sort_by((o) => o.user.name) | map((o) => o.id))
print(orders | join_on(users, "user_id", "id") | map((o) => `${o.id}: ${o.user.name}`))
```

```output
[2, 1]
["1: Bo", "2: Ann"]
```

### See also

[group_by](/docs/reference/group_by/), [find](/docs/reference/find/), [filter](/docs/reference/filter/), [merge](/docs/reference/merge/), [db.query](/docs/reference/db.query/)
