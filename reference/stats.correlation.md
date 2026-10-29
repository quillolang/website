# stats.correlation
stats.correlation(list, list, str=) -> float
group: Statistics

### What it does

Pearson's correlation coefficient of two lists of numbers of the same length, from
-1 to 1, as Python's `statistics.correlation`: 1 when the pairs lie on a rising
line, -1 on a falling one, 0 when there is no linear relation. The method is
`"linear"` by default; `"ranked"` gives Spearman's rank correlation, which
measures whether the pairs rise together at all, line or not, by correlating their
ranks (ties share their average rank).

### Examples

```quillo
let x = [1, 2, 3, 4, 5, 6, 7, 8, 9]
let y = [1, 2, 3, 1, 2, 3, 1, 2, 3]
let z = [9, 8, 7, 6, 5, 4, 3, 2, 1]
print(stats.correlation(x, x), stats.correlation(x, z), stats.correlation(x, y))
print(stats.correlation([1, 2, 3, 4], [1, 4, 9, 16]))
print(stats.correlation([1, 2, 3, 4], [1, 4, 9, 16], "ranked"))
```

```output
1.0 -1.0 0.31622776601683794
0.9843740386976972
1.0
```

### Edge cases

- The answer is clamped to -1 to 1, so rounding cannot push it past.
- An outlier pulls Pearson's down but not Spearman's: `[1, 2, 3, 4, 100]` against
  `[1, 2, 3, 4, 5]` is exactly 1 ranked.
- `null` for the method means `"linear"`.
- Two points are enough, and they always correlate at 1 or -1.
- Ints and floats can mix.

```quillo
print(stats.correlation([1, 2, 3, 4, 5], [1, 2, 3, 4, 100]))
print(stats.correlation([1, 2, 3, 4, 5], [1, 2, 3, 4, 100], "ranked"))
print(stats.correlation([1, 2, 2, 3], [1, 3, 2, 4], "ranked"), stats.correlation([1, 2], [5, 3.5], null))
```

```output
0.7249994335944137
1.0
0.9486832980505138 -1.0
```

### Errors

A constant list is a runtime error, not an error value, since its correlation is
not defined. So are lists of different lengths, fewer than two points, a method
other than `"linear"` or `"ranked"`, and an item that is not a number.

```quillo error
print(stats.correlation([1, 2, 3], [5, 5, 5]))
```

```output
line 1: `stats.correlation`: at least one of the inputs is constant
```

```quillo error
print(stats.correlation([1, 2, 3], [1, 2, 3], "spearman"))
```

```output
line 1: `stats.correlation`: unknown method "spearman" (linear or ranked)
```

```quillo error
print(stats.correlation([1], [1]))
```

```output
line 1: `stats.correlation` requires at least two data points
```

### Chaining

In a pipeline the first list comes first and the second is the argument:

```quillo
let ads = [10, 20, 30, 40]
let sales = [110, 190, 310, 390]
print(ads | stats.correlation(sales) | round(4))
print(ads | stats.correlation(sales, "ranked"))
```

```output
0.9965
1.0
```

### See also

[stats.covariance](/docs/reference/stats.covariance/), [stats.linear_regression](/docs/reference/stats.linear_regression/), [stats.rank](/docs/reference/stats.rank/)
