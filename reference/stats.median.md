# stats.median
stats.median(list) -> num
group: Statistics

### What it does

The middle value of a list of numbers, as Python's `statistics.median`. The list
need not be sorted. With an odd count it is the middle data point, and an int stays
an int. With an even count it is the mean of the two middle values, a float.

### Examples

```quillo
print(stats.median([1, 3, 2]), stats.median([1, 2, 3, 4]))
print(stats.median([1, 2, 4, 4]), stats.median([1.0, 3.0, 2.0]))
```

```output
2 2.5
3.0 2.0
```

### Edge cases

- One number gives that number.
- An even count gives a float even when the two middle values are the same:
  `[2, 2]` gives `2.0`.
- If any item is a float, the answer is a float, also with an odd count.
- Ties are fine; only the position matters.

```quillo
print(stats.median([3]), stats.median([2, 2]), stats.median([1, 2.0, 3]))
print(stats.median([5, 5, 5, 1, 9]))
```

```output
3 2.0 2.0
5
```

### Errors

The median of no data is a runtime error, not an error value: an empty list or
`null` stops the request. So does an item that is not a number.

```quillo error
print(stats.median([]))
```

```output
line 1: `stats.median` requires at least one data point
```

```quillo error
print(stats.median(["a", "b"]))
```

```output
line 1: `stats.median` expects a list of numbers, but item 0 is str
```

### Chaining

```quillo
print([9, 1, 5, 3] | stats.median)
print(([9, 1, 5, 3] | stats.median) == stats.percentile([9, 1, 5, 3], 50))
```

```output
4.0
true
```

### See also

[stats.median_low](/docs/reference/stats.median_low/), [stats.median_high](/docs/reference/stats.median_high/), [stats.mean](/docs/reference/stats.mean/), [stats.percentile](/docs/reference/stats.percentile/), [stats.quantiles](/docs/reference/stats.quantiles/)
