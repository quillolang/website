# stats.normal_pdf
stats.normal_pdf(num, num=, num=) -> float
group: Statistics

### What it does

The probability density of a normal distribution at `x`: the height of the bell
curve there, as Python's `NormalDist(mu, sigma).pdf(x)`. The mean `mu` is 0 and the
standard deviation `sigma` 1 by default, the standard normal. A density is not a
probability: it can be above 1 for a narrow curve, and the probability of a range
is [stats.normal_cdf](/docs/reference/stats.normal_cdf/) at one end minus the
other.

### Examples

```quillo
print(stats.normal_pdf(0))
print(stats.normal_pdf(1), stats.normal_pdf(-1))
print(stats.normal_pdf(100, 100, 15))
```

```output
0.3989422804014327
0.24197072451914337 0.24197072451914337
0.02659615202676218
```

### Edge cases

- The curve is symmetric about `mu`: `pdf(mu + d)` is `pdf(mu - d)`.
- The peak at `mu` is `1 / (sigma * sqrt(2π))`: a smaller `sigma` means a higher peak.
- Far from the mean the density is tiny but never `0.0`.
- `null` for `mu` or `sigma` means the default.

```quillo
print(stats.normal_pdf(0, 0, 2), stats.normal_pdf(0, 0, 0.1))
print(stats.normal_pdf(0.5, null, 1) == stats.normal_pdf(0.5))
print(stats.normal_pdf(10) > 0)
```

```output
0.19947114020071635 3.989422804014327
true
true
```

### Errors

A `sigma` of zero or below is a runtime error, not an error value. So is an
argument that is not a number, or a missing `x`.

```quillo error
print(stats.normal_pdf(0, 0, 0))
```

```output
line 1: `stats.normal_pdf`: sigma must be positive, got 0
```

```quillo error
print(stats.normal_pdf("0"))
```

```output
line 1: `stats.normal_pdf` expects a number as argument 1, got str
```

### Chaining

In a pipeline `x` comes first and `mu` and `sigma` are the arguments:

```quillo
print(1.5 | stats.normal_pdf | round(4))
print([-1, 0, 1] | map((x) => stats.normal_pdf(x, 0, 1) | round(3)))
print(115 | stats.normal_pdf(100, 15) | round(5))
```

```output
0.1295
[0.242, 0.399, 0.242]
0.01613
```

### See also

[stats.normal_cdf](/docs/reference/stats.normal_cdf/), [stats.normal_inv](/docs/reference/stats.normal_inv/), [stats.zscore](/docs/reference/stats.zscore/)
