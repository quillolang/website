# vec.mod
vec.mod(list | num, list | num) -> any
group: Vectors

### What it does

The remainder item by item, as the `%` operator gives it: two lists of the same length
pair up, or a list and a number. The remainder takes the sign of the dividend, so
`-7 % 3` is `-1`. Ints give ints and floats give floats.

### Examples

```quillo
print(vec.mod([7, 8, 9], 3))
print(vec.mod([7, 8, 9], [2, 3, 4]))
print(vec.mod(10, [3, 4]))
```

```output
[1, 2, 0]
[1, 2, 1]
[1, 2]
```

### Edge cases

- A negative dividend gives a negative remainder, as in Rust and JavaScript, not Python.
- Floats work too, with a float remainder.
- The empty list gives the empty list.

```quillo
print(vec.mod([7, -7, 8], 3))
print(vec.mod([7.5, -7.5], 2))
print(vec.mod([], 3))
```

```output
[1, -1, 2]
[1.5, -1.5]
[]
```

### Errors

An int modulo an int zero, in any item, is a `division by zero` runtime error, not an
error value. Lists of different lengths, an item that is not an int or a float, or an
argument that is neither a list nor a number are runtime errors too.

```quillo error
print(vec.mod([7, 8], 0))
```

```output
line 1: `vec.mod`: division by zero
```

```quillo error
print(vec.mod([1, 2], [3]))
```

```output
line 1: `vec.mod` needs lists of the same length (2 and 1)
```

### Chaining

`xs | vec.mod(n)` wraps each item; with `vec.arange` it makes a repeating pattern:

```quillo
print(vec.arange(8) | vec.mod(3))
print(vec.arange(10) | vec.mod(2) | vec.mul(5))
```

```output
[0, 1, 2, 0, 1, 2, 0, 1]
[0, 5, 0, 5, 0, 5, 0, 5, 0, 5]
```

### See also

[vec.div](/docs/reference/vec.div/), [vec.arange](/docs/reference/vec.arange/), [vec.mul](/docs/reference/vec.mul/)
