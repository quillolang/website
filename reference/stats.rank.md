# stats.rank
stats.rank(list | null) -> list
group: Statistics

### What it does

The rank of each number in a list, counting from 1 for the smallest, as a list in
the same order as the data. Values that tie share the average of the ranks they
would have taken, which can be a float such as `2.5`; every other rank is an int.
These are the ranks `stats.correlation(x, y, "ranked")` uses. It is not in Python's
statistics module.

### Examples

```quillo
print(stats.rank([10, 30, 20]))
print(stats.rank([10, 20, 20, 30]))
print(stats.rank([72, 85, 90, 66, 85, 78]))
```

```output
[1, 3, 2]
[1, 2.5, 2.5, 4]
[2, 4.5, 6, 1, 4.5, 3]
```

### Edge cases

- A tie of an even number of values gets a float rank; an odd one can get an int,
  since the average is then whole.
- All the same: every value gets the middle rank.
- An empty list, or `null`, gives `[]`.
- `10` and `10.0` tie.
- The smallest value is rank 1, not 0; there is no descending order, so rank the
  negated list for one.

```quillo
print(stats.rank([5, 5, 5]), stats.rank([1, 1, 1, 1, 2]), stats.rank([2, 2, 1]))
print(stats.rank([]), stats.rank(null), stats.rank([10, 10.0, 5]))
print(stats.rank([10, 30, 20] | map((x) => -x)))
```

```output
[2, 2, 2] [2.5, 2.5, 2.5, 2.5, 5] [2.5, 2.5, 1]
[] [] [2.5, 2.5, 1]
[3, 1, 2]
```

### Errors

An item that is not a number is a runtime error, not an error value. So is an
argument that is not a list or `null`.

```quillo error
print(stats.rank(["a", "b"]))
```

```output
line 1: `stats.rank` expects a list of numbers, but item 0 is str
```

### Chaining

```quillo
print([4, 1, 3] | stats.rank | map((r) => r * 10))
print([3, 1, 2] | stats.rank | map((r) => r == 1))
print([1, 2, 3] | stats.rank | sum)
```

```output
[30, 10, 20]
[false, true, false]
6
```

### See also

[stats.correlation](/docs/reference/stats.correlation/), [stats.percentile](/docs/reference/stats.percentile/), [vec.argsort](/docs/reference/vec.argsort/), [sort](/docs/reference/sort/)
