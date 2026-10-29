# stats.zscore
stats.zscore(list | null) -> list
group: Statistics

### What it does

Each number of a list as a standard score: how many standard deviations it is from
the list's mean, as a list of floats in the same order. The deviation is the
population one ([stats.pstdev](/docs/reference/stats.pstdev/)), so a list's
z-scores have mean 0 and deviation 1. It is not in Python's statistics module.

### Examples

```quillo
print(stats.zscore([1, 2, 3, 4, 5]))
print(stats.zscore([72, 85, 90, 66, 85, 78]) | map((z) => round(z, 2)))
```

```output
[-1.414213562373095, -0.7071067811865475, 0.0, 0.7071067811865475, 1.414213562373095]
[-0.89, 0.68, 1.29, -1.61, 0.68, -0.16]
```

### Edge cases

- A constant list gives zeros, not an error, and so does a list of one.
- An empty list, or `null`, gives `[]`.
- An outlier takes most of the spread for itself, so the others sit close together.
- Ints and floats can mix; the answer is always floats.

```quillo
print(stats.zscore([5, 5, 5]), stats.zscore([3]), stats.zscore([]), stats.zscore(null))
print(stats.zscore([1, 2, 3, 100]) | map((z) => round(z, 3)))
print(stats.zscore([2.5, 7.5]))
```

```output
[0.0, 0.0, 0.0] [0.0] [] []
[-0.601, -0.577, -0.554, 1.732]
[-1.0, 1.0]
```

### Errors

An item that is not a number is a runtime error, not an error value. So is an
argument that is not a list or `null`.

```quillo error
print(stats.zscore([1, "x"]))
```

```output
line 1: `stats.zscore` expects a list of numbers, but item 1 is str
```

### Chaining

```quillo
let scores = [72, 85, 90, 66, 85, 78]
print(scores | stats.zscore | filter((z) => z > 1) | len)
print(scores | stats.zscore | map((z) => round(z, 1)))
```

```output
1
[-0.9, 0.7, 1.3, -1.6, 0.7, -0.2]
```

### See also

[stats.normalize](/docs/reference/stats.normalize/), [stats.pstdev](/docs/reference/stats.pstdev/), [stats.mean](/docs/reference/stats.mean/), [stats.rank](/docs/reference/stats.rank/)
