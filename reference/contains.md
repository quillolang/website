# contains
contains(str | list | map | null, any) -> bool
group: Strings

### What it does

Whether a value holds another: in a string, the second argument as text; in a list, an
item equal to it (as `==` says); in a map, a key with that name. `null` holds nothing,
so a missing list or text gives `false` rather than an error.

### Examples

```quillo
print(contains("hello", "ell"), contains("hello", "L"))
print(contains([1, 2, 3], 2), contains(["a", "b"], "c"))
print(contains({ a: 1 }, "a"), contains({ a: 1 }, 1))
```

```output
true false
true false
true false
```

### Edge cases

- In a string the search is case-sensitive and the needle is written as text first:
  `contains("a1b", 1)` is `true`. Every string contains `""`.
- In a list the match is equality: `2.0` equals `2`, but `"2"` does not; a list or a
  map inside is found when it is equal, and `null` is found when it is there.
- In a map only keys count, as text: `contains({ "1": 1 }, 1)` is `true`, and a key
  whose value is `null` is still a key.
- `null` as the first argument is `false`.

```quillo
print(contains("a1b", 1), contains("hello", ""), contains("héllo", "é"))
print(contains([1, 2, 3], 2.0), contains([1, 2, 3], "2"), contains([[1], [2]], [1]), contains([null], null), contains([], 1))
print(contains({ "1": 1 }, 1), contains({ a: null }, "a"), contains({}, "a"))
print(contains(null, "a"))
```

```output
true true true
true false true true false
true true false
false
```

### Errors

A first argument that is not a string, list, map or `null` is a runtime error, not an
error value: a number is not searched. Convert it with `str` first.

```quillo error
print(contains(42, 4))
```

```output
line 1: `contains` expects a str, list or map, got int
```

### Chaining

In a pipeline the container comes first and the needle is the argument:

```quillo
print("a b" | contains(" "), ["a", "b"] | contains("a"))
print(["ann@x.io", "bob"] | filter((s) => s | contains("@")))
print(env("PATH") | contains("/"))
```

```output
true true
["ann@x.io"]
true
```

### See also

[index_of](/docs/reference/index_of/), [starts_with](/docs/reference/starts_with/), [ends_with](/docs/reference/ends_with/), [has](/docs/reference/has/), [any](/docs/reference/any/), [re.test](/docs/reference/re.test/)
