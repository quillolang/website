# stats.fmean
stats.fmean(list, list | null=) -> float
group: Statistics

### What it does

The mean of a list of numbers as a float, optionally weighted. With a second list of
weights, one per value, the answer is the sum of each value times its weight, divided
by the sum of the weights. Without weights, or with `null`, it is the same as
[stats.mean](/docs/reference/stats.mean/): Python's `fmean` is only a faster
`mean`, and here both give the same float.

### Examples

```quillo
print(stats.fmean([1, 2, 3, 4]))
print(stats.fmean([80, 90], [0.6, 0.4]))
print(stats.fmean([1, 2, 3], [3, 1, 1]))
```

```output
2.5
84.0
1.6
```

### Edge cases

- Weights can be ints or floats and need not add up to 1.
- A weight can be negative or zero as long as the weights' sum is not zero.
- `null` for the weights means no weights.
- One value gives that value, as a float.

```quillo
print(stats.fmean([1, 2, 3], [1, 1, 1]), stats.fmean([1, 2, 3], null))
print(stats.fmean([1, 2], [2, -1]), stats.fmean([5], [10]))
```

```output
2.0 2.0
0.0 5.0
```

### Errors

No data, weights of another length than the data, and weights that add up to zero
are each a runtime error, not an error value. So is anything in either list that is
not a number.

```quillo error
print(stats.fmean([1, 2], [1]))
```

```output
line 1: `stats.fmean`: data and weights must be the same length
```

```quillo error
print(stats.fmean([1, 2], [0, 0]))
```

```output
line 1: `stats.fmean`: the sum of the weights must be non-zero
```

```quillo error
print(stats.fmean([]))
```

```output
line 1: `stats.fmean` requires at least one data point
```

### Chaining

In a pipeline the data comes first and the weights are the argument:

```quillo
let grades = [80, 90, 70]
let credits = [3, 1, 2]
print(grades | stats.fmean(credits))
print(grades | stats.fmean | round(1))
```

```output
78.33333333333333
80.0
```

### See also

[stats.mean](/docs/reference/stats.mean/), [stats.geometric_mean](/docs/reference/stats.geometric_mean/), [stats.harmonic_mean](/docs/reference/stats.harmonic_mean/), [sum](/docs/reference/sum/)
