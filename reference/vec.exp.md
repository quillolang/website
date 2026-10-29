# vec.exp
vec.exp(list) -> list
group: Vectors

### What it does

`e` raised to each item, as a list of floats. It undoes [vec.log](/docs/reference/vec.log/), up to
float rounding.

### Examples

```quillo
print(vec.exp([0, 1, 2]))
print(vec.exp(vec.log([2, 10])))
```

```output
[1.0, 2.718281828459045, 7.38905609893065]
[2.0, 10.000000000000002]
```

### Edge cases

- A large item overflows to `inf`, not an error, unlike `math.exp(1000)`; a very
  negative one underflows to `0.0`.
- The empty list, or `null`, gives the empty list.

```quillo
print(vec.exp([1000, -1000]))
print(vec.exp([]), vec.exp(null))
```

```output
[inf, 0.0]
[] []
```

### Errors

An item that is not an int or a float, or an argument that is not a list, is a runtime
error, not an error value.

```quillo error
print(vec.exp([1, true]))
```

```output
line 1: `vec.exp` expects a list of numbers, but item 1 is bool
```

### Chaining

A softmax: exponentials scaled to sum to 1.

```quillo
let z = [1, 2, 3]
let e = z | vec.sub(max(z)) | vec.exp
print(e | vec.div(sum(e)) | vec.round(3))
```

```output
[0.09, 0.245, 0.665]
```

### See also

[vec.log](/docs/reference/vec.log/), [vec.pow](/docs/reference/vec.pow/), [math.exp](/docs/reference/math.exp/)
