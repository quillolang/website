# vec.add
vec.add(list | num, list | num) -> any
group: Vectors

### What it does

Adds item by item: two lists of the same length give a list of their pairwise sums, and
a list and a number give the list with the number added to each item. Ints stay ints
and floats stay floats, as with the `+` operator; a float and an int give a float. Two
numbers give their sum, a plain number.

### Examples

```quillo
print(vec.add([1, 2, 3], [10, 20, 30]))
print(vec.add([1, 2, 3], 10))
print(vec.add(10, [1, 2, 3]))
print(vec.add([1, 2], [0.5, 0.5]))
```

```output
[11, 22, 33]
[11, 12, 13]
[11, 12, 13]
[1.5, 2.5]
```

### Edge cases

- The empty list with the empty list, or with a number, is the empty list.
- Each pair is typed on its own: in a mixed list the ints stay ints and the floats stay
  floats.
- Two numbers without a list are added like `+`.
- A list in a list is not a matrix: `vec.add([[1]], 1)` is an error, since `[1]` is not a
  number.

```quillo
print(vec.add([], []), vec.add([], 5))
print(vec.add([1, 2.5], 1))
print(vec.add(1, 2), vec.add(1, 2.5))
```

```output
[] []
[2, 3.5]
3 3.5
```

### Errors

Lists of different lengths, an item that is not an int or a float (a string, `null`, a
boolean, a decimal), or an argument that is neither a list nor a number are runtime
errors, not error values. An int sum past 64 bits is an `integer overflow` runtime error.

```quillo error
print(vec.add([1, 2, 3], [1, 2]))
```

```output
line 1: `vec.add` needs lists of the same length (3 and 2)
```

```quillo error
print(vec.add([1, 2], [null, 1]))
```

```output
line 1: `vec.add` expects numbers, got int and null
```

### Chaining

In a pipeline the left list is the first argument, so `xs | vec.add(1)` adds 1 to each
item and `xs | vec.add(ys)` adds the two lists:

```quillo
print([1, 2, 3] | vec.mul(2) | vec.add([1, 1, 1]))
print(vec.arange(3) | vec.add(0.5))
```

```output
[3, 5, 7]
[0.5, 1.5, 2.5]
```

### See also

[vec.sub](/docs/reference/vec.sub/), [vec.mul](/docs/reference/vec.mul/), [vec.div](/docs/reference/vec.div/), [vec.cumsum](/docs/reference/vec.cumsum/), [sum](/docs/reference/sum/), [map](/docs/reference/map/)
