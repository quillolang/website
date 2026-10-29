# stats.describe
stats.describe(list | null) -> map
group: Statistics

### What it does

A summary of a list of numbers in one map, as a data frame's `describe`:
`{ count, sum, mean, std, min, q1, median, q3, max }`. `std` is the sample standard
deviation ([stats.stdev](/docs/reference/stats.stdev/)) and the quartiles follow
numpy's linear rule ([stats.percentile](/docs/reference/stats.percentile/) at 25,
50 and 75). It is not in Python's statistics module.

### Examples

```quillo
print(stats.describe([1, 2, 3, 4]))
let d = stats.describe([72, 85, 90, 66, 85, 78])
print(d.count, d.mean, d.q3 - d.q1)
```

```output
{ count: 4, sum: 10, mean: 2.5, std: 1.2909944487358056, min: 1, q1: 1.75, median: 2.5, q3: 3.25, max: 4 }
6 79.33333333333333 11.5
```

### Edge cases

- No data is not an error: an empty list or `null` gives `count: 0`, `sum: 0` and
  `null` for the rest.
- One number has no sample deviation: `std` is `null`; the rest are that number.
- `sum`, `min` and `max` stay ints for an int list; `mean`, `std` and the quartiles
  are always floats.
- A float anywhere makes `sum`, `min` and `max` floats.

```quillo
print(stats.describe([]))
print(stats.describe(null).count)
print(stats.describe([7]))
print(stats.describe([2.5, 1.5]))
```

```output
{ count: 0, sum: 0, mean: null, std: null, min: null, q1: null, median: null, q3: null, max: null }
0
{ count: 1, sum: 7, mean: 7.0, std: null, min: 7, q1: 7.0, median: 7.0, q3: 7.0, max: 7 }
{ count: 2, sum: 4.0, mean: 2.0, std: 0.7071067811865476, min: 1.5, q1: 1.75, median: 2.0, q3: 2.25, max: 2.5 }
```

### Errors

An item that is not a number is a runtime error, not an error value. So is an
argument that is not a list or `null`.

```quillo error
print(stats.describe([1, "a"]))
```

```output
line 1: `stats.describe` expects a list of numbers, but item 1 is str
```

```quillo error
print(stats.describe(42))
```

```output
line 1: `stats.describe` expects a list as argument 1, got int
```

### Chaining

```quillo
print([3, 1, 2] | stats.describe | get("median"))
let summary = [{ total: 12.5 }, { total: 30 }, { total: 7.5 }] | vec.column("total") | stats.describe
print(summary.min, summary.max, summary.mean | round(2))
```

```output
2.0
7.5 30.0 16.67
```

### See also

[stats.mean](/docs/reference/stats.mean/), [stats.stdev](/docs/reference/stats.stdev/), [stats.percentile](/docs/reference/stats.percentile/), [stats.quantiles](/docs/reference/stats.quantiles/), [min](/docs/reference/min/), [max](/docs/reference/max/), [sum](/docs/reference/sum/)
