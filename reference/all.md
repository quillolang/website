# all
all(list | null, fn) -> bool
group: Lists

### What it does

`true` when the function gives a true value for every item, else `false`. The function
takes one argument, the item, and is called in order; the check stops at the first no.
`null` counts as an empty list.

### Examples

```quillo
print(all([2, 4, 6], (x) => x % 2 == 0))
print(all([2, 3, 6], (x) => x % 2 == 0))
let people = [{ name: "Ann", age: 30 }, { name: "Bo", age: 15 }]
print(all(people, (p) => p.age >= 18))
print(all(["a", "b"], (s) => len(s) == 1))
```

```output
true
false
false
true
```

### Edge cases

- An empty list or `null` gives `true`: there is no item to say no. Check `len` first
  when an empty list must not pass.
- The function is not called past the first item that fails.
- The result is read for truth as `if` reads it: only `false`, `null` and an error
  value are no, so `all(xs, (x) => x)` is `true` when no item is null or false; `0`
  and `""` pass.

```quillo
print(all([], (x) => false), all(null, (x) => false))
let xs = []
print(len(xs) > 0 && all(xs, (x) => x > 0))
print(all([1, 2, 3], (x) => { print("checking", x)
    x < 2 }))
print(all([1, 0, ""], (x) => x), all([1, null], (x) => x), all([1, false], (x) => x))
```

```output
true true
false
checking 1
checking 2
false
true false false
```

### Errors

A first argument that is not a list or `null`, or a second that is not a function, is
a runtime error, not an error value. An error inside the function stops the request.

```quillo error
print(all("abc", (c) => c != " "))
```

```output
line 1: `all` expects a list as argument 1, got str
```

```quillo error
print(all([1, 2], "x"))
```

```output
line 1: `all` expects a function as argument 2, got str
```

### Chaining

In a pipeline the list comes first: `xs | all(f)`. It reads well as a condition, and
after a [map](/docs/reference/map/) that computes what to check.

```quillo
let ages = [30, 25, 41]
print(ages | all((a) => a >= 18) ? "all adults" : "not all adults")
print(["1", "2", "x"] | map(int) | all((v) => !is_err(v)))
```

```output
all adults
false
```

### See also

[any](/docs/reference/any/), [filter](/docs/reference/filter/), [count](/docs/reference/count/), [find](/docs/reference/find/)
