# stats.normal_cdf
stats.normal_cdf(num, num=, num=) -> float
group: Statistics

### What it does

The cumulative probability of a normal distribution at `x`: the share of the
distribution that lies at or below `x`, from 0 to 1, as Python's
`NormalDist(mu, sigma).cdf(x)`. The mean `mu` is 0 and the standard deviation
`sigma` 1 by default, the standard normal. The probability of a range is the
difference of two of them.

### Examples

```quillo
print(stats.normal_cdf(0))
print(stats.normal_cdf(1.96), stats.normal_cdf(-1.96))
print(stats.normal_cdf(130, 100, 15))
print(stats.normal_cdf(1.96) - stats.normal_cdf(-1.96))
```

```output
0.5
0.9750021048517796 0.024997895148220428
0.9772498680518208
0.9500042097035593
```

### Edge cases

- At `mu` it is exactly `0.5`.
- Far below the mean it is `0.0` and far above `1.0`; the float runs out of digits.
- It is the inverse of [stats.normal_inv](/docs/reference/stats.normal_inv/), up to
  the last digit.
- `null` for `mu` or `sigma` means the default.

```quillo
print(stats.normal_cdf(7, 7, 3), stats.normal_cdf(-50), stats.normal_cdf(50))
print(stats.normal_cdf(stats.normal_inv(0.3)))
print(stats.normal_cdf(0, null, 2))
```

```output
0.5 0.0 1.0
0.30000000000000004
0.5
```

### Errors

A `sigma` of zero or below is a runtime error, not an error value. So is an
argument that is not a number, or a missing `x`.

```quillo error
print(stats.normal_cdf(0, 0, -1))
```

```output
line 1: `stats.normal_cdf`: sigma must be positive, got -1
```

```quillo error
print(stats.normal_cdf())
```

```output
line 1: `stats.normal_cdf` expects a number as argument 1, got nothing
```

### Chaining

In a pipeline `x` comes first and `mu` and `sigma` are the arguments:

```quillo
print(1 | stats.normal_cdf | round(4))
print(130 | stats.normal_cdf(100, 15) | round(3))
print(1 - (130 | stats.normal_cdf(100, 15)) | round(3))
```

```output
0.8413
0.977
0.023
```

### See also

[stats.normal_inv](/docs/reference/stats.normal_inv/), [stats.normal_pdf](/docs/reference/stats.normal_pdf/), [math.erf](/docs/reference/math.erf/), [stats.zscore](/docs/reference/stats.zscore/)
