# vec.argsort
vec.argsort(list | null, bool=) -> list
group: Vectors

### What it does

The positions that would put a list of numbers in ascending order: `vec.argsort([30,
10, 20])` is `[1, 2, 0]`, since item 1 is the smallest. With `true` as the second
argument the order is descending. Equal items keep their order. Index another list by
these positions to sort it the same way, which is how to sort names by their scores.

### Examples

```quillo
print(vec.argsort([30, 10, 20]))
print(vec.argsort([30, 10, 20], true))
let xs = [30, 10, 20]
print(vec.argsort(xs) | map((i) => xs[i]))
```

```output
[1, 2, 0]
[0, 2, 1]
[10, 20, 30]
```

### Edge cases

- Ties stay in their input order, ascending or descending: the sort is stable.
- The empty list, or `null`, gives the empty list.
- `NaN` sorts after every other number.
- Ints and floats mix.

```quillo
print(vec.argsort([1, 1, 0]), vec.argsort([1, 1, 1], true))
print(vec.argsort([]), vec.argsort(null))
print(vec.argsort([float("nan"), 1, 2]))
print(vec.argsort([2.5, 1, 2]))
```

```output
[2, 0, 1] [0, 1, 2]
[] []
[1, 2, 0]
[1, 2, 0]
```

### Errors

An item that is not an int or a float, or an argument that is not a list, is a runtime
error, not an error value. Strings are not sorted this way; use `sort` or `sort_by`.

```quillo error
print(vec.argsort(["b", "a"]))
```

```output
line 1: `vec.argsort` expects a list of numbers, but item 0 is str
```

### Chaining

The descending positions give a ranking; the first is the top:

```quillo
let names = ["ann", "bob", "cy"]
let scores = [71, 88.5, 64]
print(vec.argsort(scores, true) | map((i) => names[i]))
print(scores | vec.argsort(true) | first)
```

```output
["bob", "ann", "cy"]
1
```

### See also

[vec.argmin](/docs/reference/vec.argmin/), [vec.argmax](/docs/reference/vec.argmax/), [sort](/docs/reference/sort/), [sort_by](/docs/reference/sort_by/), [stats.rank](/docs/reference/stats.rank/)
