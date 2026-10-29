# vec.argmax
vec.argmax(list | null) -> int | null
group: Vectors

### What it does

The position of the largest number in a list, counting from 0. When several items tie,
the first one wins. The empty list has no largest item and gives `null`.

### Examples

```quillo
print(vec.argmax([3, 1, 2]))
let scores = [71, 88.5, 88.5]
print(vec.argmax(scores), scores[vec.argmax(scores)])
```

```output
0
1 88.5
```

### Edge cases

- Ties go to the first: `vec.argmax([2, 2, 1])` is `0`.
- The empty list, or `null`, gives `null`.
- `NaN` is skipped; a list of only `NaN` gives `null`.
- `inf` is the largest of all.

```quillo
print(vec.argmax([2, 2, 1]), vec.argmax([1.5, 2, -3]))
print(vec.argmax([]), vec.argmax(null))
print(vec.argmax([float("nan"), 2, 1]), vec.argmax([float("nan"), float("nan")]))
print(vec.argmax([1, math.inf, 2]))
```

```output
0 1
null null
1 null
1
```

### Errors

An item that is not an int or a float, or an argument that is not a list, is a runtime
error, not an error value.

```quillo error
print(vec.argmax([1, null]))
```

```output
line 1: `vec.argmax` expects a list of numbers, but item 1 is null
```

### Chaining

```quillo
let names = ["ann", "bob", "cy"]
let scores = [71, 88.5, 64]
print(names[vec.argmax(scores)])
print(scores | vec.argmax)
```

```output
bob
1
```

### See also

[vec.argmin](/docs/reference/vec.argmin/), [vec.argsort](/docs/reference/vec.argsort/), [max](/docs/reference/max/), [index_of](/docs/reference/index_of/)
