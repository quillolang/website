# stats.covariance
stats.covariance(list, list) -> float
group: Statistics

### What it does

The sample covariance of two lists of numbers of the same length: how much they
vary together, as Python's `statistics.covariance`. Positive when the pairs rise
together, negative when one falls as the other rises, near zero when they are
unrelated. The sum of the products of the distances from each mean is divided by
one less than the count. Its scale is the data's, so for a scale-free measure use
[stats.correlation](/docs/reference/stats.correlation/).

### Examples

```quillo
let x = [1, 2, 3, 4, 5, 6, 7, 8, 9]
let y = [1, 2, 3, 1, 2, 3, 1, 2, 3]
let z = [9, 8, 7, 6, 5, 4, 3, 2, 1]
print(stats.covariance(x, y), stats.covariance(x, z))
```

```output
0.75 -7.5
```

### Edge cases

- The order of the two lists does not matter.
- A list with itself gives its sample variance.
- A constant list gives `0.0`.
- Two points are enough.
- Ints and floats can mix; the answer is always a float.

```quillo
print(stats.covariance([1, 2, 3], [3, 2, 1]), stats.covariance([3, 2, 1], [1, 2, 3]))
print(stats.covariance([1, 2, 3], [1, 2, 3]) == stats.variance([1, 2, 3]))
print(stats.covariance([1, 2], [3, 3]), stats.covariance([1, 2], [2, 4.0]))
```

```output
-1.0 -1.0
true
0.0 1.0
```

### Errors

Lists of different lengths, fewer than two points, or an item that is not a number
are each a runtime error, not an error value.

```quillo error
print(stats.covariance([1, 2, 3], [1, 2]))
```

```output
line 1: `stats.covariance` needs lists of the same length (3 and 2)
```

```quillo error
print(stats.covariance([1], [2]))
```

```output
line 1: `stats.covariance` requires at least two data points
```

### Chaining

In a pipeline the first list comes first and the second is the argument:

```quillo
let ads = [10, 20, 30, 40]
let sales = [110, 190, 310, 390]
print(ads | stats.covariance(sales))
print((ads | stats.covariance(sales)) / stats.variance(ads))
```

```output
1600.0
9.600000000000001
```

### See also

[stats.correlation](/docs/reference/stats.correlation/), [stats.variance](/docs/reference/stats.variance/), [stats.linear_regression](/docs/reference/stats.linear_regression/)
