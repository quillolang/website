# stats.mean
stats.mean(list) -> float
group: Statistics

### What it does

The arithmetic mean of a list of numbers, as a float: the sum divided by the count.
It is Python's `statistics.mean`: the sum is compensated and rounded once, so the
answer is the correctly rounded mean, not the running sum divided by the count.
Ints and floats can mix; the answer is always a float.

### Examples

```quillo
print(stats.mean([1, 2, 3, 4]), stats.mean([1, 2, 3]), stats.mean([1.5, 2.5]))
print(stats.mean([0.1, 0.2, 0.3]), (0.1 + 0.2 + 0.3) / 3)
```

```output
2.5 2.0 2.0
0.2 0.20000000000000004
```

### Edge cases

- One number gives that number, as a float.
- The list is read into floats first: an int past 2⁵³ (about 9 × 10¹⁵) loses its
  last digits, where Python keeps them exact.
- Floats whose sum overflows give `inf`, not the mean Python gets through fractions.
- Decimals are not accepted; convert them with `float`.

```quillo
print(stats.mean([5]), stats.mean([-1, 1]))
print(stats.mean([9007199254740993, 9007199254740993]))
print(stats.mean([1e308, 1e308]))
print(stats.mean([dec("1.5"), dec("2.5")] | map(float)))
```

```output
5.0 0.0
9007199254740992.0
inf
2.0
```

### Errors

The mean of no data is a runtime error, not an error value: an empty list or `null`
stops the request. So does a list with something that is not a number in it, or a
decimal. Guard with `len` when the list can be empty.

```quillo error
print(stats.mean([]))
```

```output
line 1: `stats.mean` requires at least one data point
```

```quillo error
print(stats.mean([1, "2"]))
```

```output
line 1: `stats.mean` expects a list of numbers, but item 1 is str
```

```quillo
let xs = []
print(len(xs) > 0 && stats.mean(xs))
```

```output
false
```

### Chaining

In a pipeline the list comes first, so `stats.mean` takes it as its only argument:

```quillo
print([3, 1, 2] | stats.mean)
print([{ total: 12.5 }, { total: 30 }, { total: 7.5 }] | vec.column("total") | stats.mean)
print([1, 2, 3, 10] | filter((x) => x < 10) | stats.mean)
```

```output
2.0
16.666666666666668
2.0
```

### See also

[stats.fmean](/docs/reference/stats.fmean/), [stats.median](/docs/reference/stats.median/), [stats.geometric_mean](/docs/reference/stats.geometric_mean/), [stats.harmonic_mean](/docs/reference/stats.harmonic_mean/), [stats.describe](/docs/reference/stats.describe/), [sum](/docs/reference/sum/), [math.fsum](/docs/reference/math.fsum/)
