# stats.quantiles
stats.quantiles(list, int=, str=) -> list
group: Statistics

### What it does

The cut points that divide a list of numbers into `n` parts of equal probability,
as Python's `statistics.quantiles`: `n - 1` floats in rising order. `n` is 4 by
default (quartiles); 10 gives deciles, 100 percentiles. The method is `"exclusive"`
by default, which treats the data as a sample and places the cut points as if the
smallest and largest values were not quite the extremes; `"inclusive"` treats the
data as the whole population, so the first and last cut points cannot go past the
data. The list need not be sorted.

### Examples

```quillo
print(stats.quantiles([1, 2, 3, 4, 5]))
print(stats.quantiles([1, 2, 3, 4, 5], 4, "inclusive"))
print(stats.quantiles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 10))
```

```output
[1.5, 3.0, 4.5]
[2.0, 3.0, 4.0]
[1.1, 2.2, 3.3, 4.4, 5.5, 6.6, 7.7, 8.8, 9.9]
```

### Edge cases

- `n` can be from 1 to 10,000. `n = 1` gives `[]`: no cut points.
- One data point gives that point `n - 1` times.
- Exclusive cut points can lie outside the data: `[1, 2]` gives `0.75` and `2.25`.
  Inclusive ones never do.
- The answer is floats, also for int data, and the method can be `null` for the default.
- A whole-number float for `n`, such as `4.0`, is accepted as the int.

```quillo
print(stats.quantiles([1, 2, 3], 1), stats.quantiles([5]))
print(stats.quantiles([1, 2], 4), stats.quantiles([1, 2], 4, "inclusive"))
print(stats.quantiles([3, 1, 2], 2, null), stats.quantiles([3, 1, 2], 2.0))
```

```output
[] [5.0, 5.0, 5.0]
[0.75, 1.5, 2.25] [1.25, 1.5, 1.75]
[2.0] [2.0]
```

### Errors

No data, an `n` outside 1 to 10,000, a method other than `"exclusive"` or
`"inclusive"`, or an item that is not a number are each a runtime error, not an
error value.

```quillo error
print(stats.quantiles([1, 2, 3], 0))
```

```output
line 1: `stats.quantiles`: n must be from 1 to 10000, got 0
```

```quillo error
print(stats.quantiles([1, 2, 3], 4, "nearest"))
```

```output
line 1: `stats.quantiles`: unknown method "nearest" (exclusive or inclusive)
```

```quillo error
print(stats.quantiles([]))
```

```output
line 1: `stats.quantiles` requires at least one data point
```

### Chaining

```quillo
let data = [105, 129, 87, 86, 111, 111, 89, 81, 108, 92, 110, 100, 75, 105, 103, 109, 76, 119, 99, 91]
print(data | stats.quantiles)
print(data | stats.quantiles(10) | map((q) => round(q, 1)))
let [q1, q2, q3] = data | stats.quantiles(4, "inclusive")
print(q3 - q1)
```

```output
[87.5, 101.5, 109.75]
[76.5, 86.2, 89.6, 94.8, 101.5, 105.0, 108.7, 110.8, 118.2]
20.75
```

### See also

[stats.percentile](/docs/reference/stats.percentile/), [stats.median](/docs/reference/stats.median/), [stats.describe](/docs/reference/stats.describe/), [sort](/docs/reference/sort/)
