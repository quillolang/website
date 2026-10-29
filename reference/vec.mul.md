# vec.mul
vec.mul(list | num, list | num) -> any
group: Vectors

### What it does

Multiplies item by item: two lists of the same length give a list of their pairwise
products, and a list and a number give the list with each item scaled by the number.
Ints stay ints and floats stay floats, as with the `*` operator. Two numbers give their
product. For the sum of the products use [vec.dot](/docs/reference/vec.dot/).

### Examples

```quillo
print(vec.mul([1, 2, 3], [4, 5, 6]))
print(vec.mul([1, 2, 3], 10))
print(vec.mul(0.5, [10, 20]))
```

```output
[4, 10, 18]
[10, 20, 30]
[5.0, 10.0]
```

### Edge cases

- Each pair is typed on its own: `[1.5, 2]` times 2 is `[3.0, 4]`.
- Scaling by 0 gives zeros, ints for ints and `0.0` for floats.
- The empty list gives the empty list.

```quillo
print(vec.mul([1.5, 2], 2))
print(vec.mul([1, 2.5], 0))
print(vec.mul([], 3))
```

```output
[3.0, 4]
[0, 0.0]
[]
```

### Errors

Lists of different lengths, an item that is not an int or a float, or an argument that
is neither a list nor a number are runtime errors, not error values. An int product past
64 bits is an `integer overflow` runtime error; use floats for numbers that large.

```quillo error
print(vec.mul([9223372036854775807], 2))
```

```output
line 1: integer overflow
```

```quillo error
print(vec.mul([1, 2], [1]))
```

```output
line 1: `vec.mul` needs lists of the same length (2 and 1)
```

### Chaining

`xs | vec.mul(k)` scales a list in a pipeline, often before rounding:

```quillo
print(vec.linspace(0, 1, 5) | vec.mul(100) | vec.round)
print(vec.ones(3) | vec.mul(7))
```

```output
[0, 25, 50, 75, 100]
[7, 7, 7]
```

### See also

[vec.dot](/docs/reference/vec.dot/), [vec.div](/docs/reference/vec.div/), [vec.pow](/docs/reference/vec.pow/), [vec.cumprod](/docs/reference/vec.cumprod/), [math.prod](/docs/reference/math.prod/)
