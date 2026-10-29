# vec.log
vec.log(list) -> list
group: Vectors

### What it does

The natural logarithm of each item, as a list of floats. For another base divide by the
logarithm of that base: `vec.div(vec.log(xs), math.log(2))` is log base 2.

### Examples

```quillo
print(vec.log([1, math.e, 100]))
print(vec.log([8, 1024]) | vec.div(math.log(2)))
```

```output
[0.0, 1.0, 4.605170185988092]
[3.0, 10.0]
```

### Edge cases

- `0` gives `-inf` and a negative number gives `NaN`, not an error, unlike
  `math.log(0)`.
- The empty list, or `null`, gives the empty list.

```quillo
print(vec.log([0, -1]))
print(vec.log([]), vec.log(null))
```

```output
[-inf, NaN]
[] []
```

### Errors

An item that is not an int or a float, or an argument that is not a list, is a runtime
error, not an error value.

```quillo error
print(vec.log([1, "e"]))
```

```output
line 1: `vec.log` expects a list of numbers, but item 1 is str
```

### Chaining

Log returns of a price series: the differences of the logs.

```quillo
let prices = [100, 110, 99]
print(prices | vec.log | vec.diff | vec.round(4))
```

```output
[0.0953, -0.1054]
```

### See also

[vec.exp](/docs/reference/vec.exp/), [vec.sqrt](/docs/reference/vec.sqrt/), [math.log](/docs/reference/math.log/), [vec.diff](/docs/reference/vec.diff/)
