# math.sumprod
math.sumprod(list, list) -> num
group: Math

### What it does

The sum of the products of two lists item by item, a dot product, as Python's
`math.sumprod`: `math.sumprod([1, 2, 3], [4, 5, 6])` is `4 + 10 + 18`, `32`. Two lists
of ints give an exact int; otherwise the products and the sum are taken as if in twice
the precision and rounded once, so floats come out as exactly as `math.fsum` sums
them. A quantity list times a price list is a total.

### Examples

```quillo
print(math.sumprod([1, 2, 3], [4, 5, 6]), math.sumprod([1.5, 2], [2, 3]))
let quantities = [2, 1, 4]
let prices = [9.99, 24.5, 0.75]
print(math.sumprod(quantities, prices))
```

```output
32 9.0
47.480000000000004
```

### Edge cases

- Two empty lists give `0`, an int; `null` counts as an empty list.
- One float anywhere makes the result a float, `11.0` for `[1, 2]` and `[3, 4.0]`.
- Int products that pass what an int holds (about 9.2 × 10¹⁸) are a runtime error,
  `integer overflow`, not a float.
- The float sum is compensated: `[1e100, 1, -1e100]` against ones gives `1.0`, where a
  plain loop gives `0.0`.

```quillo
print(math.sumprod([], []), math.sumprod(null, null), math.sumprod([1, 2], [3, 4.0]))
print(math.sumprod([1e100, 1, -1e100], [1, 1, 1]))
```

```output
0 0 11.0
1.0
```

```quillo error
print(math.sumprod([9223372036854775807, 1], [2, 1]))
```

```output
line 1: integer overflow
```

### Errors

Lists of different lengths are a runtime error, not an error value, as Python's
`ValueError`; the message gives both lengths. A list item that is not a number, or an
argument that is not a list, is a runtime error as well.

```quillo error
print(math.sumprod([1, 2], [1]))
```

```output
line 1: `math.sumprod` needs lists of the same length (2 and 1)
```

```quillo error
print(math.sumprod([1, "2"], [3, 4]))
```

```output
line 1: `math.sumprod` expects a list of numbers, but item 1 is str
```

### Chaining

In a pipeline the first list comes first, so `xs | math.sumprod(ys)`. A weighted total
and a weighted mean:

```quillo
let scores = [80, 90, 70]
let weights = [0.5, 0.3, 0.2]
print(scores | math.sumprod(weights))
print(math.sumprod(scores, weights) / sum(weights))
```

```output
81.0
81.0
```

### See also

[vec.dot](/docs/reference/vec.dot/), [math.fsum](/docs/reference/math.fsum/), [math.prod](/docs/reference/math.prod/), [stats.fmean](/docs/reference/stats.fmean/)
