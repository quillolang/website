# stats.percentile
stats.percentile(list, num | list) -> any
group: Statistics

### What it does

The value below which `p` percent of a list of numbers lies, with `p` from 0 to 100,
by numpy's default rule: the sorted data is laid out from 0 to 100 and the answer is
interpolated linearly between the two closest data points. It is not in Python's
statistics module; `stats.quantiles` is the Python way. With one `p` the answer is a
float; with a list of them, a list of floats in the same order. The list need not be
sorted.

### Examples

```quillo
print(stats.percentile([1, 2, 3, 4, 5], 50))
print(stats.percentile([1, 2, 3, 4, 5], 90))
print(stats.percentile([1, 2, 3, 4, 5], [0, 25, 100]))
```

```output
3.0
4.6
[1.0, 2.0, 5.0]
```

### Edge cases

- `0` gives the smallest value and `100` the largest; `50` is the median.
- The answer is a float even for int data and whole-number results.
- One data point gives that point for any `p`.
- `p` can be a float, and an empty list of `p` gives `[]`.
- Between two points the answer is linear: `[10, 20]` at 50 is `15.0`.

```quillo
print(stats.percentile([3, 1, 2], 0), stats.percentile([3, 1, 2], 100))
print(stats.percentile([5, 1, 3], 50) == stats.median([5, 1, 3]))
print(stats.percentile([7], 30), stats.percentile([10, 20], 50), stats.percentile([1, 2, 3, 4, 5], [10.5]))
print(stats.percentile([1, 2, 3], []))
```

```output
1.0 3.0
true
7.0 15.0 [1.42]
[]
```

### Errors

A `p` outside 0 to 100, in a list too, is a runtime error, not an error value. So
are no data, a missing `p`, and a `p` that is not a number.

```quillo error
print(stats.percentile([1, 2, 3], 101))
```

```output
line 1: `stats.percentile`: percentiles are from 0 to 100, got 101
```

```quillo error
print(stats.percentile([1, 2, 3], [50, -1]))
```

```output
line 1: `stats.percentile`: percentiles are from 0 to 100, got -1
```

```quillo error
print(stats.percentile([], 50))
```

```output
line 1: `stats.percentile` requires at least one data point
```

### Chaining

In a pipeline the data comes first and `p` is the argument:

```quillo
let latency = [12, 15, 11, 240, 14, 13, 18, 16, 15, 12]
print(latency | stats.percentile(95))
print(latency | stats.percentile([50, 90, 99]) | map((v) => round(v, 1)))
```

```output
140.09999999999977
[14.5, 40.2, 220.0]
```

### See also

[stats.quantiles](/docs/reference/stats.quantiles/), [stats.median](/docs/reference/stats.median/), [stats.describe](/docs/reference/stats.describe/), [stats.rank](/docs/reference/stats.rank/)
