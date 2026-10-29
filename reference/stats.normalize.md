# stats.normalize
stats.normalize(list | null) -> list
group: Statistics

### What it does

Each number of a list scaled to 0..1: the smallest value becomes `0.0`, the largest
`1.0`, and the rest keep their proportions between them. The answer is a list of
floats in the same order. It is min-max scaling, not in Python's statistics module;
for scaling by the spread use [stats.zscore](/docs/reference/stats.zscore/).

### Examples

```quillo
print(stats.normalize([1, 2, 3, 4, 5]))
print(stats.normalize([72, 85, 90, 66, 85, 78]) | map((v) => round(v, 2)))
```

```output
[0.0, 0.25, 0.5, 0.75, 1.0]
[0.25, 0.79, 1.0, 0.0, 0.79, 0.5]
```

### Edge cases

- A constant list gives zeros, not an error, and so does a list of one.
- An empty list, or `null`, gives `[]`.
- Negative numbers are fine; the smallest is the zero point.
- The order is kept: a falling list gives a falling answer.

```quillo
print(stats.normalize([5, 5, 5]), stats.normalize([3]), stats.normalize([]))
print(stats.normalize([-2, 0, 2]), stats.normalize([10, 0]))
```

```output
[0.0, 0.0, 0.0] [0.0] []
[0.0, 0.5, 1.0] [1.0, 0.0]
```

### Errors

An item that is not a number is a runtime error, not an error value. So is an
argument that is not a list or `null`.

```quillo error
print(stats.normalize([1, null]))
```

```output
line 1: `stats.normalize` expects a list of numbers, but item 1 is null
```

### Chaining

```quillo
print([1, 2, 3] | stats.normalize | map((v) => v * 100))
print([4, 1, 3] | stats.normalize | map((v) => round(v, 2)))
```

```output
[0.0, 50.0, 100.0]
[1.0, 0.0, 0.67]
```

### See also

[stats.zscore](/docs/reference/stats.zscore/), [stats.rank](/docs/reference/stats.rank/), [min](/docs/reference/min/), [max](/docs/reference/max/), [vec.clip](/docs/reference/vec.clip/)
