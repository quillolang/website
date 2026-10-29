# reduce
reduce(list | null, any, fn) -> any
group: Lists

### What it does

Folds the list into one value. The start value comes second and the function third:
`reduce(xs, start, f)`, the other way round from JavaScript's `xs.reduce(f, start)`.
The function takes two arguments, the value so far and the next item, and gives the
new value so far; the last of those is the result. `null` counts as an empty list.

### Examples

```quillo
print(reduce([1, 2, 3], 0, (acc, x) => acc + x))
print(reduce([1, 2, 3], 1, (acc, x) => acc * x))
print(reduce(["a", "b", "c"], "", (acc, s) => acc + s))
print(reduce([1, 2, 3], {}, (m, x) => set(m, str(x), x * x)))
```

```output
6
6
abc
{ "1": 1, "2": 4, "3": 9 }
```

### Edge cases

- The start value is required: an empty list or `null` gives it back unchanged, and
  the function is not called.
- The start value can be anything, a list or a map included. Values never change, so
  the function returns a new one each round (`push`, `set`, `merge`) and the last
  returned is the result.
- The function takes exactly two parameters, in this order: the value so far, then
  the item.
- For a plain total, [sum](/docs/reference/sum/), [min](/docs/reference/min/) and
  [max](/docs/reference/max/) need no function.

```quillo
print(reduce([], 10, (acc, x) => acc + x), reduce(null, "start", (acc, x) => acc + x))
print(reduce([1, 2, 3], [], (acc, x) => push(acc, x * 2)))
print(reduce([3, 1, 2], null, (best, x) => best == null || x > best ? x : best))
print(reduce(["a", "bb"], 0, (n, s) => n + len(s)))
```

```output
10 start
[2, 4, 6]
3
3
```

### Errors

A list that is not a list or `null`, or a function that is not a function, is a
runtime error, not an error value. Leaving the start value out gives the function to
the second parameter and nothing to the third, so that is a runtime error too. An
error inside the function stops the request.

```quillo error
print(reduce([1, 2], (acc, x) => acc + x))
```

```output
line 1: `reduce` expects a function as argument 3, got nothing
```

```quillo error
print(reduce([1, 2], 0, (acc) => acc))
```

```output
line 1: `<fn>` takes 1 argument, got 2
```

### Chaining

In a pipeline the list comes first and the start value and the function follow:
`xs | reduce(start, f)`.

```quillo
print([3, 1, 2] | reduce(0, (acc, x) => acc + x))
print(["pear", "fig"] | map(len) | reduce(0, (acc, n) => acc + n))
print(range(1, 6) | reduce(1, (acc, x) => acc * x))
```

```output
6
7
120
```

### See also

[sum](/docs/reference/sum/), [map](/docs/reference/map/), [filter](/docs/reference/filter/), [push](/docs/reference/push/), [set](/docs/reference/set/), [group_by](/docs/reference/group_by/)
