# count
count(list | null, fn=) -> int
group: Lists

### What it does

How many items there are, or, with a function, how many of them the function says
yes to. The function takes one argument, the item, and its result is read for truth
as `if` reads it: only `false`, `null` and an error value are no. `null` counts as an
empty list and gives `0`.

### Examples

```quillo
print(count([1, 2, 3]))
print(count([1, 2, 3, 4], (x) => x > 2))
let people = [{ name: "Ann", admin: true }, { name: "Bo", admin: false }]
print(count(people, (p) => p.admin))
```

```output
3
2
1
```

### Edge cases

- An empty list or `null` gives `0`, with or without a function.
- Without a function, `count(xs)` is `len(xs)`.
- With a function, a result of `false`, `null` or an error value does not count;
  anything else does, `0` and `""` included.
- Nothing matching gives `0`, never `null`.

```quillo
print(count([]), count(null), count(null, (x) => true))
print(count([1, 2, 3]) == len([1, 2, 3]))
print(count([1, 0, "", null, false, "a"], (x) => x))
print(count([int("1"), int("x")], (v) => v))
print(count([1, 2], (x) => x > 5))
```

```output
0 0 0
true
4
1
0
```

### Errors

A first argument that is not a list or `null`, or a second that is not a function, is
a runtime error, not an error value. A string has `len`, not `count`. An error inside
the function stops the request.

```quillo error
print(count("abc"))
```

```output
line 1: `count` expects a list as argument 1, got str
```

```quillo error
print(count([1, 2], 5))
```

```output
line 1: `count` expects a function as argument 2, got int
```

### Chaining

In a pipeline the list comes first and the function is the only argument:
`xs | count(f)`. It is `filter` and `len` in one step.

```quillo
print(range(10) | count((x) => x % 3 == 0))
print(["pear", "fig", "apple"] | count((w) => len(w) > 3))
print(["pear", "fig", "apple"] | filter((w) => len(w) > 3) | len)
```

```output
4
2
2
```

### See also

[len](/docs/reference/len/), [filter](/docs/reference/filter/), [any](/docs/reference/any/), [all](/docs/reference/all/), [sum](/docs/reference/sum/), [group_by](/docs/reference/group_by/)
