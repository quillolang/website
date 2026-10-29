# filter
filter(list | null, fn) -> list
group: Lists

### What it does

The items for which the function gives a true value, in their original order, as a
new list. The function takes one argument, the item. A result counts as true the way
`if` reads it: only `false`, `null` and an error value drop the item; `0`, `""` and
`[]` keep it. `null` counts as an empty list and gives `[]`.

### Examples

```quillo
print(filter([1, 2, 3, 4], (x) => x % 2 == 0))
let people = [{ name: "Ann", age: 30 }, { name: "Bo", age: 15 }]
print(filter(people, (p) => p.age >= 18))
print(filter(["a", "", "b"], (s) => s != ""))
```

```output
[2, 4]
[{ name: "Ann", age: 30 }]
["a", "b"]
```

### Edge cases

- An empty list or `null` gives `[]`.
- Nothing matching gives `[]`, never `null`.
- The function's result is read for truth, not compared with `true`: returning the
  item itself drops only `null`, `false` and error values, and keeps `0` and `""`.
  Error values are falsy, so `filter(xs, (v) => v)` is one way to keep the good results
  of a conversion.
- The list given is not changed; `filter` builds a new one.

```quillo
print(filter([], (x) => true), filter(null, (x) => true))
print(filter([1, 2], (x) => x > 5))
print(filter([0, 1, "", "a", null, [], {}, false], (x) => x))
print(filter([int("1"), int("x"), int("3")], (v) => v))
let xs = [1, 2, 3]
let evens = filter(xs, (x) => x % 2 == 0)
print(xs, evens)
```

```output
[] []
[]
[0, 1, "", "a", [], {}]
[1, 3]
[1, 2, 3] [2]
```

### Errors

A first argument that is not a list or `null`, or a second that is not a function, is
a runtime error, not an error value. An error inside the function stops the request at
the item that failed.

```quillo error
print(filter({ a: 1 }, (x) => true))
```

```output
line 1: `filter` expects a list as argument 1, got map
```

```quillo error
print(filter([1, "a"], (x) => x > 0))
```

```output
line 1: cannot compare str with int
```

### Chaining

In a pipeline the list comes first: `xs | filter(f)`. Pair it with
[map](/docs/reference/map/) to change what is kept, [count](/docs/reference/count/) to
only count the matches, [find](/docs/reference/find/) when one item is enough.

```quillo
print([3, 1, 2, 5] | filter((x) => x > 1) | sort)
print(split(",a,,b,", ",") | filter((p) => p != "") | join("-"))
print(["7", "x", "9"] | map(int) | filter((v) => !is_err(v)))
```

```output
[2, 3, 5]
a-b
[7, 9]
```

### See also

[map](/docs/reference/map/), [find](/docs/reference/find/), [count](/docs/reference/count/), [any](/docs/reference/any/), [all](/docs/reference/all/), [unique](/docs/reference/unique/)
