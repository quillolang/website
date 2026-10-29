# vec.zeros
vec.zeros(int) -> list
group: Vectors

### What it does

A list of `n` ints, all `0`. For zeros as floats multiply by `0.0`, or use
`vec.full(n, 0.0)`.

### Examples

```quillo
print(vec.zeros(3))
print(vec.zeros(0))
```

```output
[0, 0, 0]
[]
```

### Edge cases

- The items are ints, so arithmetic on them stays in ints until a float is mixed in.
- A whole float counts as the int it is: `vec.zeros(2.0)` is `[0, 0]`.
- At most ten million items.

```quillo
print(vec.zeros(2) | vec.add(1))
print(vec.zeros(2) | vec.add(0.5))
print(vec.zeros(2.0))
print(vec.full(2, 0.0))
```

```output
[1, 1]
[0.5, 0.5]
[0, 0]
[0.0, 0.0]
```

### Errors

A negative count, or one over ten million, is a runtime error, not an error value; so is
a count that is not an int.

```quillo error
print(vec.zeros(-1))
```

```output
line 1: `vec.zeros`: -1 is not a count from 0 to 10000000
```

```quillo error
print(vec.zeros("3"))
```

```output
line 1: `vec.zeros` expects an int as argument 1, got str
```

### Chaining

A row of counters to add into, or a blank matrix built from rows:

```quillo
print(vec.zeros(4) | len)
print(range(2) | map((i) => vec.zeros(3)))
```

```output
4
[[0, 0, 0], [0, 0, 0]]
```

### See also

[vec.ones](/docs/reference/vec.ones/), [vec.full](/docs/reference/vec.full/), [vec.arange](/docs/reference/vec.arange/), [vec.linspace](/docs/reference/vec.linspace/)
