# vec.cumprod
vec.cumprod(list | null) -> list
group: Vectors

### What it does

The running product: a list where each item is the product of the input up to and
including that position. Ints stay ints and floats stay floats, as with `*`.

### Examples

```quillo
print(vec.cumprod([1, 2, 3, 4]))
print(vec.cumprod([2, 0.5, 4]))
```

```output
[1, 2, 6, 24]
[2, 1.0, 4.0]
```

### Edge cases

- The empty list, or `null`, gives the empty list; one item gives itself.
- A zero makes every later item zero.
- Growth factors chained this way give the compounded value at each step.

```quillo
print(vec.cumprod([]), vec.cumprod(null), vec.cumprod([3]))
print(vec.cumprod([1, 0, 5]))
print(vec.cumprod([1.1, 1.1, 1.1]) | vec.round(3))
```

```output
[] [] [3]
[1, 0, 0]
[1.1, 1.21, 1.331]
```

### Errors

An item that is not an int or a float, or an argument that is not a list, is a runtime
error, not an error value. An int product past 64 bits is an `integer overflow` runtime
error; use floats when the products grow that large.

```quillo error
print(vec.cumprod([9223372036854775807, 2]))
```

```output
line 1: integer overflow
```

```quillo error
print(vec.cumprod(["a"]))
```

```output
line 1: `vec.cumprod` expects numbers, got str
```

### Chaining

```quillo
print(vec.arange(1, 6) | vec.cumprod)
print(vec.full(3, 2) | vec.cumprod | last)
```

```output
[1, 2, 6, 24, 120]
8
```

### See also

[vec.cumsum](/docs/reference/vec.cumsum/), [vec.mul](/docs/reference/vec.mul/), [math.prod](/docs/reference/math.prod/)
