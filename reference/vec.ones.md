# vec.ones
vec.ones(int) -> list
group: Vectors

### What it does

A list of `n` ints, all `1`. Scaled with `vec.mul` it is a list of any one number, as
`vec.full(n, x)` is directly.

### Examples

```quillo
print(vec.ones(3))
print(vec.ones(3) | vec.mul(7))
```

```output
[1, 1, 1]
[7, 7, 7]
```

### Edge cases

- `vec.ones(0)` is the empty list.
- The items are ints: `vec.ones(3) == vec.full(3, 1)`, and not `vec.full(3, 1.0)`.
- At most ten million items.

```quillo
print(vec.ones(0))
print(vec.ones(3) == vec.full(3, 1), vec.ones(3) == vec.full(3, 1.0))
```

```output
[]
true true
```

### Errors

A negative count, or one over ten million, is a runtime error, not an error value; so is
a count that is not an int.

```quillo error
print(vec.ones(20000000))
```

```output
line 1: `vec.ones`: 20000000 is not a count from 0 to 10000000
```

### Chaining

Equal weights for a weighted mean, and a dot product with ones as a plain sum:

```quillo
let xs = [2, 4, 9]
print(vec.dot(xs, vec.ones(3)))
print(vec.ones(3) | vec.div(3) | vec.dot(xs))
```

```output
15
5.0
```

### See also

[vec.zeros](/docs/reference/vec.zeros/), [vec.full](/docs/reference/vec.full/), [vec.mul](/docs/reference/vec.mul/), [vec.dot](/docs/reference/vec.dot/)
