# vec.dot
vec.dot(list, list) -> num
group: Vectors

### What it does

The dot product of two lists of the same length: the sum of the pairwise products. Two
lists of ints give an int, computed exactly; any float gives a float, summed with
compensation so that the result is what exact arithmetic rounded once would give.

### Examples

```quillo
print(vec.dot([1, 2, 3], [4, 5, 6]))
print(vec.dot([1.5, 2], [2, 2]))
```

```output
32
7.0
```

### Edge cases

- Two empty lists give `0`.
- `null` counts as the empty list.
- The float sum is compensated: `vec.dot([0.1, 0.2, 0.3], [1, 1, 1])` is `0.6`, where
  adding the three by hand gives `0.6000000000000001`.

```quillo
print(vec.dot([], []), vec.dot(null, null))
print(vec.dot([0.1, 0.2, 0.3], [1, 1, 1]), 0.1 + 0.2 + 0.3)
```

```output
0 0
0.6 0.6000000000000001
```

### Errors

Lists of different lengths, an item that is not an int or a float, or an argument that
is not a list are runtime errors, not error values. An int result past 64 bits is an
`integer overflow` runtime error; convert to floats for numbers that large.

```quillo error
print(vec.dot([1, 2], [1]))
```

```output
line 1: `vec.dot` needs lists of the same length (2 and 1)
```

```quillo error
print(vec.dot([9223372036854775807, 1], [2, 1]))
```

```output
line 1: integer overflow
```

### Chaining

`xs | vec.dot(ys)` reads naturally; with `vec.norm` it gives the cosine of the angle
between two lists:

```quillo
let a = [1, 2]
let b = [3, 4]
print(a | vec.dot(b))
print(vec.dot(a, b) / (vec.norm(a) * vec.norm(b)))
```

```output
11
0.9838699100999074
```

### See also

[vec.mul](/docs/reference/vec.mul/), [vec.norm](/docs/reference/vec.norm/), [vec.matmul](/docs/reference/vec.matmul/), [math.sumprod](/docs/reference/math.sumprod/), [sum](/docs/reference/sum/)
