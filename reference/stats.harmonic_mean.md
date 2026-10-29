# stats.harmonic_mean
stats.harmonic_mean(list) -> float
group: Statistics

### What it does

The harmonic mean of a list of numbers that are zero or more: the count divided by
the sum of the reciprocals, as Python's `statistics.harmonic_mean`. It is the mean
for rates: a trip at 40 km/h one way and 60 km/h back averages 48 km/h, not 50.

### Examples

```quillo
print(stats.harmonic_mean([40, 60]))
print(stats.harmonic_mean([60, 60]))
print(stats.harmonic_mean([2.5, 3, 10]))
```

```output
48.0
60.0
3.5999999999999996
```

### Edge cases

- A zero anywhere makes the answer `0.0`, as in Python.
- One number gives that number, as a float.
- Ints and floats can mix; the answer is always a float.

```quillo
print(stats.harmonic_mean([1, 0, 3]), stats.harmonic_mean([7]))
```

```output
0.0 7.0
```

### Errors

No data, a negative number, or something that is not a number are each a runtime
error, not an error value.

```quillo error
print(stats.harmonic_mean([1, -2]))
```

```output
line 1: `stats.harmonic_mean` does not support negative values
```

```quillo error
print(stats.harmonic_mean([]))
```

```output
line 1: `stats.harmonic_mean` requires at least one data point
```

### Chaining

```quillo
let speeds = [40, 60, 80]
print(speeds | stats.harmonic_mean | round(2))
```

```output
55.38
```

### See also

[stats.mean](/docs/reference/stats.mean/), [stats.geometric_mean](/docs/reference/stats.geometric_mean/), [stats.fmean](/docs/reference/stats.fmean/)
