# stats.linear_regression
stats.linear_regression(list, list, bool=) -> map
group: Statistics

### What it does

The line `y = slope * x + intercept` that fits two lists of numbers of the same
length best, by least squares, as Python's `statistics.linear_regression`. The
answer is a map `{ slope, intercept }` of floats. With `true` as the third argument
the line is proportional: it goes through the origin, the intercept is `0.0` and
only the slope is fitted.

### Examples

```quillo
print(stats.linear_regression([1, 2, 3, 4, 5], [3, 5, 7, 9, 11]))
print(stats.linear_regression([1, 2, 3], [2.1, 3.9, 6.2]))
let fit = stats.linear_regression([1, 2, 3, 4, 5], [3, 5, 7, 9, 11])
print(fit.slope * 6 + fit.intercept)
```

```output
{ slope: 2.0, intercept: 1.0 }
{ slope: 2.05, intercept: -0.033333333333333215 }
13.0
```

### Edge cases

- Proportional: the slope changes too, since the line must pass through the origin.
- Points that do not lie on a line still give a line, the closest one.
- Two points are enough, and the line goes through both.
- `false` or `null` as the third argument is the ordinary fit.
- Ints and floats can mix; both numbers are floats.

```quillo
print(stats.linear_regression([1, 2, 3], [4, 7, 10]), stats.linear_regression([1, 2, 3], [4, 7, 10], true))
print(stats.linear_regression([1, 2, 3, 4], [1, 3, 2, 4]))
print(stats.linear_regression([1, 2], [1, 2]), stats.linear_regression([1, 2, 3], [3, 6, 9], null))
```

```output
{ slope: 3.0, intercept: 1.0 } { slope: 3.4285714285714284, intercept: 0.0 }
{ slope: 0.8, intercept: 0.5 }
{ slope: 1.0, intercept: 0.0 } { slope: 3.0, intercept: 0.0 }
```

### Errors

A constant `x` is a runtime error, not an error value: no slope fits. For a
proportional fit the same holds when `x` is all zeros. Lists of different lengths,
fewer than two points, and an item that is not a number are runtime errors too.

```quillo error
print(stats.linear_regression([2, 2, 2], [1, 2, 3]))
```

```output
line 1: `stats.linear_regression`: x is constant
```

```quillo error
print(stats.linear_regression([0, 0], [1, 2], true))
```

```output
line 1: `stats.linear_regression`: x is all zeros
```

```quillo error
print(stats.linear_regression([1, 2], [1, 2, 3]))
```

```output
line 1: `stats.linear_regression` needs lists of the same length (2 and 3)
```

### Chaining

In a pipeline `x` comes first and `y` is the argument:

```quillo
let year = [2021, 2022, 2023, 2024]
let users = [120, 150, 190, 220]
let fit = year | stats.linear_regression(users)
print(fit.slope | round(1), year | stats.linear_regression(users) | get("slope") | round(1))
print(year | map((y) => fit.slope * y + fit.intercept) | map((v) => round(v, 1)))
```

```output
34.0 34.0
[119.0, 153.0, 187.0, 221.0]
```

### See also

[stats.correlation](/docs/reference/stats.correlation/), [stats.covariance](/docs/reference/stats.covariance/), [stats.mean](/docs/reference/stats.mean/)
