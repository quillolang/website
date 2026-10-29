# vec.rolling_mean
vec.rolling_mean(list, int) -> list
group: Vectors

### What it does

The moving average: the mean of each run of `window` neighbouring items, as a list of
floats. Only full windows count, so the result has `len(xs) - window + 1` items and
starts at the first position where a whole window fits. `vec.rolling_mean(daily, 7)` is a
week's moving average.

### Examples

```quillo
print(vec.rolling_mean([1, 2, 3, 4, 5], 3))
let daily = [10, 12, 9, 14, 11, 13, 8, 15]
print(vec.rolling_mean(daily, 7))
```

```output
[2.0, 3.0, 4.0]
[11.0, 11.714285714285714]
```

### Edge cases

- A window of 1 is the list itself, as floats.
- A window as long as the list gives one item, the mean of all.
- A window longer than the list gives the empty list; so do the empty list and `null`.
- The sums are compensated: the total of `[0.1, 0.2, 0.3]` is `0.6`, not
  `0.6000000000000001`, and the mean is `0.6 / 3`, which float division gives as
  `0.19999999999999998`.
- A whole float counts as the int it is: a window of `2.0` is 2.

```quillo
print(vec.rolling_mean([1, 2, 3], 1), vec.rolling_mean([1, 2, 3], 3))
print(vec.rolling_mean([1, 2, 3], 4), vec.rolling_mean([], 2), vec.rolling_mean(null, 1))
print(vec.rolling_mean([0.1, 0.2, 0.3], 3))
print(vec.rolling_mean([1, 2], 2.0))
```

```output
[1.0, 2.0, 3.0] [2.0]
[] [] []
[0.19999999999999998]
[1.5]
```

### Errors

A window below 1, a missing window, a window that is not an int, an item that is not an
int or a float, or a first argument that is not a list are runtime errors, not error
values.

```quillo error
print(vec.rolling_mean([1, 2], 0))
```

```output
line 1: `vec.rolling_mean`: the window must be at least 1, got 0
```

```quillo error
print(vec.rolling_mean([1, 2]))
```

```output
line 1: `vec.rolling_mean` expects an int as argument 2, got nothing
```

### Chaining

```quillo
let sales = [3, 5, 4, 6, 8]
print(sales | vec.rolling_mean(2))
print(sales | vec.rolling_mean(3) | vec.round(1) | last)
```

```output
[4.0, 4.5, 5.0, 7.0]
6.0
```

### See also

[vec.rolling_sum](/docs/reference/vec.rolling_sum/), [stats.mean](/docs/reference/stats.mean/), [vec.cumsum](/docs/reference/vec.cumsum/), [vec.diff](/docs/reference/vec.diff/)
