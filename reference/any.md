# any
any(list | null, fn) -> bool
group: Lists

### What it does

`true` when the function gives a true value for at least one item, else `false`. The
function takes one argument, the item, and is called in order; the search stops at the
first yes. `null` counts as an empty list.

### Examples

```quillo
print(any([1, 2, 3], (x) => x > 2))
print(any([1, 2, 3], (x) => x > 5))
let people = [{ name: "Ann", admin: false }, { name: "Bo", admin: true }]
print(any(people, (p) => p.admin))
print(any(["a", "b"], (s) => s == "b"))
```

```output
true
false
true
true
```

### Edge cases

- An empty list or `null` gives `false`: there is no item to say yes.
- The function is not called past the first match.
- The result is read for truth as `if` reads it: only `false`, `null` and an error
  value are no, so `0` and `""` are yes. A function that returns the item gives
  `true` when some item is not null or false.
- To ask whether a value is in a list, [contains](/docs/reference/contains/) needs no
  function.

```quillo
print(any([], (x) => true), any(null, (x) => true))
print(any([1, 2, 3], (x) => { print("looking at", x)
    x > 1 }))
print(any([null, false], (x) => x), any([null, 0], (x) => x), any([null, ""], (x) => x))
print(any([1, 2], (x) => x == 2), contains([1, 2], 2))
```

```output
false false
looking at 1
looking at 2
true
false true true
true true
```

### Errors

A first argument that is not a list or `null`, or a second that is not a function, is
a runtime error, not an error value. An error inside the function stops the request.

```quillo error
print(any(5, (x) => true))
```

```output
line 1: `any` expects a list as argument 1, got int
```

```quillo error
print(any([1, 2], true))
```

```output
line 1: `any` expects a function as argument 2, got bool
```

### Chaining

In a pipeline the list comes first: `xs | any(f)`. The result is a boolean, so it
reads well in a condition.

```quillo
let names = ["ann", "bob"]
print(names | any((n) => starts_with(n, "b")) ? "a b name" : "no b name")
print(names | map(len) | any((n) => n > 5))
```

```output
a b name
false
```

### See also

[all](/docs/reference/all/), [find](/docs/reference/find/), [contains](/docs/reference/contains/), [count](/docs/reference/count/), [filter](/docs/reference/filter/)
