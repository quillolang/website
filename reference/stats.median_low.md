# stats.median_low
stats.median_low(list) -> num
group: Statistics

### What it does

The low median of a list of numbers: always one of the data points. With an odd
count it is the middle value; with an even count it is the lower of the two middle
values, where [stats.median](/docs/reference/stats.median/) would average them. An
int list gives an int.

### Examples

```quillo
print(stats.median_low([1, 2, 3, 4]), stats.median_low([1, 3, 2]))
print(stats.median_low([1, 2, 4, 4]))
```

```output
2 2
2
```

### Edge cases

- One number gives that number.
- The answer is a float only when the list holds a float.
- A list need not be sorted.

```quillo
print(stats.median_low([7]), stats.median_low([1.0, 2, 3, 4]), stats.median_low([10, 2, 8, 4]))
```

```output
7 2.0 4
```

### Errors

No data is a runtime error, not an error value: an empty list or `null` stops the
request. So does an item that is not a number.

```quillo error
print(stats.median_low([]))
```

```output
line 1: `stats.median_low` requires at least one data point
```

### Chaining

```quillo
let sizes = [8, 2, 4, 6]
print(sizes | stats.median_low, sizes | stats.median_high, sizes | stats.median)
```

```output
4 6 5.0
```

### See also

[stats.median](/docs/reference/stats.median/), [stats.median_high](/docs/reference/stats.median_high/), [stats.percentile](/docs/reference/stats.percentile/)
