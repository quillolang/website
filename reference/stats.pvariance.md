# stats.pvariance
stats.pvariance(list, num | null=) -> float
group: Statistics

### What it does

The population variance of a list of numbers: the mean of the squared distances
from the mean, dividing by the count. It is Python's `statistics.pvariance`, for
data that is the whole population; for a sample use
[stats.variance](/docs/reference/stats.variance/), which divides by one less. The
answer is a float, computed with the compensated sums Python's fractions give.

### Examples

```quillo
print(stats.pvariance([1, 2, 3, 4]))
print(stats.pvariance([0.0, 0.25, 0.25, 1.25, 1.5, 1.75, 2.75, 3.25]))
```

```output
1.25
1.25
```

### Edge cases

- One number is enough: its variance is `0.0`. A constant list gives `0.0` too.
- A second argument, a mean already known, is accepted, but the answer is the spread
  about the data's own mean whatever is given, as in Python before 3.11: a correction
  in the sum cancels the difference. Leave it out, or pass `null`.
- Ints and floats can mix; the answer is always a float.

```quillo
print(stats.pvariance([5]), stats.pvariance([7, 7, 7]))
print(stats.pvariance([1, 2, 3, 4], 0), stats.pvariance([1, 2, 3, 4], 2.5), stats.pvariance([1, 2, 3, 4], null))
```

```output
0.0 0.0
1.25 1.25 1.25
```

### Errors

No data is a runtime error, not an error value: an empty list or `null` stops the
request. So does an item that is not a number, or a second argument that is not a
number.

```quillo error
print(stats.pvariance([]))
```

```output
line 1: `stats.pvariance` requires at least one data point
```

```quillo error
print(stats.pvariance([1, 2], "x"))
```

```output
line 1: `stats.pvariance` expects a number as argument 2, got str
```

### Chaining

```quillo
print([2, 4, 4, 4, 5, 5, 7, 9] | stats.pvariance)
print([2, 4, 4, 4, 5, 5, 7, 9] | stats.pvariance | math.sqrt)
```

```output
4.0
2.0
```

### See also

[stats.variance](/docs/reference/stats.variance/), [stats.pstdev](/docs/reference/stats.pstdev/), [stats.stdev](/docs/reference/stats.stdev/), [stats.mean](/docs/reference/stats.mean/)
