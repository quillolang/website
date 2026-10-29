# vec.sqrt
vec.sqrt(list) -> list
group: Vectors

### What it does

The square root of each item, as a list of floats. Ints come back as floats too:
`vec.sqrt([4])` is `[2.0]`.

### Examples

```quillo
print(vec.sqrt([1, 4, 9]))
print(vec.sqrt([2, 0.25]))
```

```output
[1.0, 2.0, 3.0]
[1.4142135623730951, 0.5]
```

### Edge cases

- A negative item gives `NaN`, not an error, unlike `math.sqrt(-1)`.
- `0` gives `0.0`; `inf` gives `inf`.
- The empty list, or `null`, gives the empty list.

```quillo
print(vec.sqrt([-1, 0]))
print(vec.sqrt([math.inf]))
print(vec.sqrt([]), vec.sqrt(null))
```

```output
[NaN, 0.0]
[inf]
[] []
```

### Errors

An item that is not an int or a float, or an argument that is not a list, is a runtime
error, not an error value.

```quillo error
print(vec.sqrt(3))
```

```output
line 1: `vec.sqrt` expects a list as argument 1, got int
```

### Chaining

The root mean square of a list, and the lengths of several vectors at once:

```quillo
let xs = [3, 4, 12]
print(xs | vec.pow(2) | stats.mean | math.sqrt)
print([[3, 4], [5, 12]] | map((v) => vec.dot(v, v)) | vec.sqrt)
```

```output
7.505553499465135
[5.0, 13.0]
```

### See also

[vec.pow](/docs/reference/vec.pow/), [vec.exp](/docs/reference/vec.exp/), [vec.log](/docs/reference/vec.log/), [math.sqrt](/docs/reference/math.sqrt/), [sqrt](/docs/reference/sqrt/)
