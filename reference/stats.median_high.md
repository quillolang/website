# stats.median_high
stats.median_high(list) -> num
group: Statistics

### What it does

The high median of a list of numbers: always one of the data points. With an odd
count it is the middle value; with an even count it is the higher of the two middle
values, where [stats.median](/docs/reference/stats.median/) would average them. An
int list gives an int.

### Examples

```quillo
print(stats.median_high([1, 2, 3, 4]), stats.median_high([1, 3, 2]))
print(stats.median_high([1, 2, 4, 4]))
```

```output
3 2
4
```

### Edge cases

- One number gives that number.
- The answer is a float only when the list holds a float.
- A list need not be sorted.

```quillo
print(stats.median_high([7]), stats.median_high([1.0, 2, 3, 4]), stats.median_high([10, 2, 8, 4]))
```

```output
7 3.0 8
```

### Errors

No data is a runtime error, not an error value: an empty list or `null` stops the
request. So does an item that is not a number.

```quillo error
print(stats.median_high(null))
```

```output
line 1: `stats.median_high` requires at least one data point
```

### Chaining

```quillo
let sizes = [8, 2, 4, 6]
print(sizes | stats.median_high, sizes | stats.median_low, sizes | stats.median)
```

```output
6 4 5.0
```

### See also

[stats.median](/docs/reference/stats.median/), [stats.median_low](/docs/reference/stats.median_low/), [stats.percentile](/docs/reference/stats.percentile/)
