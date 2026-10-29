# map
map(list | null, fn) -> list
group: Lists

### What it does

A new list with the function applied to each item, in order. The function takes one
argument, the item, and its result takes the item's place; the list given is left as it
was. `null` counts as an empty list and gives `[]`.

### Examples

```quillo
print(map([1, 2, 3], (x) => x * 2))
print(map(["ann", "bob"], upper))
let people = [{ name: "Ann", age: 30 }, { name: "Bo", age: 25 }]
print(map(people, (p) => p.name))
print(map([1, 2], (x) => x > 1 ? "big" : "small"))
```

```output
[2, 4, 6]
["ANN", "BOB"]
["Ann", "Bo"]
["small", "big"]
```

### Edge cases

- An empty list or `null` gives `[]`; the function is not called.
- The result is as long as the input, whatever the function gives: `null` results stay
  in the list. To drop items use [filter](/docs/reference/filter/).
- The items can be of any type, and so can the results; a mixed list maps fine as long
  as the function copes with each item.
- The function takes exactly one parameter. A pair in the list arrives as one value:
  take it apart with `let [a, b] = p` inside the body.

```quillo
print(map([], (x) => x * 2), map(null, (x) => x * 2))
print(map([1, 2, 3], (x) => x == 2 ? null : x))
print(map([1, "a", null], type_of))
print(map([[1, 2], [3, 4]], (p) => { let [a, b] = p
    a + b }))
```

```output
[] []
[1, null, 3]
["int", "str", "null"]
[3, 7]
```

### Errors

A first argument that is not a list or `null`, or a second that is not a function, is
a runtime error, not an error value. So is an error inside the function: it stops the
request at the item that failed. A function with the wrong number of parameters is a
runtime error too.

```quillo error
print(map("abc", (x) => x))
```

```output
line 1: `map` expects a list as argument 1, got str
```

```quillo error
print(map([1, 2], 5))
```

```output
line 1: `map` expects a function as argument 2, got int
```

```quillo error
print(map([1, "x"], (x) => x * 2))
```

```output
line 1: cannot multiply str and int
```

### Chaining

In a pipeline the list comes first and the function is the only argument written, so
`map` reads as a step: `xs | map(f)`. It goes with
[filter](/docs/reference/filter/) and [sum](/docs/reference/sum/) before or after it.

```quillo
print([1, 2, 3, 4] | filter((x) => x % 2 == 0) | map((x) => x * 10))
print("1,2,3" | split(",") | map(int) | sum)
print(range(3) | map((i) => `row ${i}`) | join(", "))
```

```output
[20, 40]
6
row 0, row 1, row 2
```

### See also

[filter](/docs/reference/filter/), [reduce](/docs/reference/reduce/), [find](/docs/reference/find/), [enumerate](/docs/reference/enumerate/), [zip](/docs/reference/zip/), [flatten](/docs/reference/flatten/)
