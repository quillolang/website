# stats.variance
stats.variance(list, num | null=) -> float
group: Statistics

### What it does

The sample variance of a list of numbers: the sum of the squared distances from the
mean, divided by one less than the count (Bessel's correction). It is Python's
`statistics.variance`, for data that is a sample of a larger population; for the
whole population use [stats.pvariance](/docs/reference/stats.pvariance/). The
answer is a float, computed with compensated sums so it is Python's exact result.

### Examples

```quillo
print(stats.variance([1, 2, 3, 4]))
print(stats.variance([2.75, 1.75, 1.25, 0.25, 0.5, 1.25, 3.5]))
```

```output
1.6666666666666667
1.3720238095238095
```

### Edge cases

- At least two numbers are needed: one number is an error, not `0.0`.
- A constant list gives `0.0`.
- A second argument, a mean already known, is accepted, but the answer is the spread
  about the data's own mean whatever is given, as in Python before 3.11: a correction
  in the sum cancels the difference. Leave it out, or pass `null`.
- The sample variance of two lists that are the same is their covariance.

```quillo
print(stats.variance([7, 7, 7]), stats.variance([1.0, 2.0]))
print(stats.variance([1, 2, 3, 4], 0), stats.variance([1, 2, 3, 4], 2.5), stats.variance([1, 2, 3, 4], null))
print(stats.variance([1, 2, 3]) == stats.covariance([1, 2, 3], [1, 2, 3]))
```

```output
0.0 0.5
1.6666666666666667 1.6666666666666667 1.6666666666666667
true
```

### Errors

Fewer than two numbers is a runtime error, not an error value: an empty list, `null`
or a list of one stops the request. So does an item that is not a number.

```quillo error
print(stats.variance([5]))
```

```output
line 1: `stats.variance` requires at least 2 data points
```

```quillo error
print(stats.variance([]))
```

```output
line 1: `stats.variance` requires at least 2 data points
```

### Chaining

```quillo
let xs = [2, 4, 4, 4, 5, 5, 7, 9]
print(xs | stats.variance | round(3))
print(len(xs) > 1 && (xs | stats.variance) > 0)
```

```output
4.571
true
```

### See also

[stats.pvariance](/docs/reference/stats.pvariance/), [stats.stdev](/docs/reference/stats.stdev/), [stats.pstdev](/docs/reference/stats.pstdev/), [stats.covariance](/docs/reference/stats.covariance/), [stats.mean](/docs/reference/stats.mean/)
