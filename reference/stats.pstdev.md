# stats.pstdev
stats.pstdev(list, num | null=) -> float
group: Statistics

### What it does

The population standard deviation of a list of numbers: the square root of
[stats.pvariance](/docs/reference/stats.pvariance/), as Python's
`statistics.pstdev`. It is in the data's own units, where the variance is in
their square. For a sample of a larger population use
[stats.stdev](/docs/reference/stats.stdev/).

### Examples

```quillo
print(stats.pstdev([1, 2, 3, 4]))
print(stats.pstdev([1.5, 2.5, 2.5, 2.75, 3.25, 4.75]))
```

```output
1.118033988749895
0.986893273527251
```

### Edge cases

- One number is enough: its deviation is `0.0`, and so is a constant list's.
- A second argument, a mean already known, is accepted, but the answer is the spread
  about the data's own mean whatever is given, as in Python before 3.11. Leave it
  out, or pass `null`.
- It is the square root of `stats.pvariance` exactly.

```quillo
print(stats.pstdev([5]), stats.pstdev([7, 7, 7]))
print(stats.pstdev([1, 2, 3, 4], 0), stats.pstdev([1, 2, 3, 4], null))
print(stats.pstdev([1, 2, 3, 4]) == math.sqrt(stats.pvariance([1, 2, 3, 4])))
```

```output
0.0 0.0
1.118033988749895 1.118033988749895
true
```

### Errors

No data is a runtime error, not an error value: an empty list or `null` stops the
request. So does an item that is not a number.

```quillo error
print(stats.pstdev([]))
```

```output
line 1: `stats.pstdev` requires at least one data point
```

### Chaining

```quillo
let xs = [2, 4, 4, 4, 5, 5, 7, 9]
print(xs | stats.pstdev)
print((xs | map((x) => (x - stats.mean(xs)) / stats.pstdev(xs))) == stats.zscore(xs))
```

```output
2.0
true
```

### See also

[stats.stdev](/docs/reference/stats.stdev/), [stats.pvariance](/docs/reference/stats.pvariance/), [stats.zscore](/docs/reference/stats.zscore/), [math.sqrt](/docs/reference/math.sqrt/)
