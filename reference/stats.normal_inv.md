# stats.normal_inv
stats.normal_inv(num, num=, num=) -> float
group: Statistics

### What it does

The inverse of [stats.normal_cdf](/docs/reference/stats.normal_cdf/): the `x` below
which a share `p` of a normal distribution lies, with `p` strictly between 0 and 1,
as Python's `NormalDist(mu, sigma).inv_cdf(p)` (Wichura's algorithm AS241). The mean
`mu` is 0 and the standard deviation `sigma` 1 by default, the standard normal. It
gives the critical values of tests and the cut points of confidence intervals.

### Examples

```quillo
print(stats.normal_inv(0.5))
print(stats.normal_inv(0.975), stats.normal_inv(0.025))
print(stats.normal_inv(0.9, 100, 15))
```

```output
0.0
1.9599639845400536 -1.9599639845400538
119.22327348316901
```

### Edge cases

- `p` of 0 or 1 is an error, not infinity: the tails never end.
- A `p` very close to 0 or 1 is fine; `1e-300` gives about -37.
- It is symmetric: `inv(1 - p)` is `-inv(p)` about `mu`, up to the last digit.
- `null` for `mu` or `sigma` means the default.

```quillo
print(stats.normal_inv(1e-300), stats.normal_inv(0.999999))
print(stats.normal_inv(0.5, 7, 3), stats.normal_inv(0.84, null, null))
print(stats.normal_inv(stats.normal_cdf(1.5)))
```

```output
-37.0470962993612 4.753424308817089
7.0 0.9944578832097528
1.4999999999999998
```

### Errors

A `p` of 0, 1, or outside them is a runtime error, not an error value. So are a
`sigma` of zero or below and an argument that is not a number.

```quillo error
print(stats.normal_inv(0))
```

```output
line 1: `stats.normal_inv`: p must be between 0 and 1 (exclusive), got 0
```

```quillo error
print(stats.normal_inv(1))
```

```output
line 1: `stats.normal_inv`: p must be between 0 and 1 (exclusive), got 1
```

```quillo error
print(stats.normal_inv(0.5, 0, 0))
```

```output
line 1: `stats.normal_inv`: sigma must be positive, got 0
```

### Chaining

In a pipeline `p` comes first and `mu` and `sigma` are the arguments:

```quillo
print(0.975 | stats.normal_inv | round(3))
print(0.95 | stats.normal_inv(100, 15) | round(1))
print([0.025, 0.5, 0.975] | map((p) => stats.normal_inv(p) | round(2)))
```

```output
1.96
124.7
[-1.96, 0.0, 1.96]
```

### See also

[stats.normal_cdf](/docs/reference/stats.normal_cdf/), [stats.normal_pdf](/docs/reference/stats.normal_pdf/), [stats.percentile](/docs/reference/stats.percentile/)
