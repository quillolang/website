# stats.histogram
stats.histogram(list | null, int | list=) -> map
group: Statistics

### What it does

Counts a list of numbers into bins, as numpy's `histogram`: a map `{ counts, edges }`
where `edges` has one more float than `counts` has ints. With an int (10 by
default) the bins are that many, equal in width, from the smallest value to the
largest. With a list the bins are between the edges given, which must rise. Each bin
takes the values from its left edge up to but not including its right one; the last
bin includes its right edge too.

### Examples

```quillo
print(stats.histogram([1, 2, 2, 3, 3, 3, 4], 3))
print(stats.histogram([1, 2, 2, 3, 3, 3, 4], [0, 2, 4]))
let h = stats.histogram([72, 85, 90, 66, 85, 78], 3)
print(h.counts, h.edges)
```

```output
{ counts: [1, 2, 4], edges: [1.0, 2.0, 3.0, 4.0] }
{ counts: [1, 6], edges: [0.0, 2.0, 4.0] }
[2, 1, 3] [66.0, 74.0, 82.0, 90.0]
```

### Edge cases

- A value on an inner edge goes to the bin on its right; the largest value goes to
  the last bin.
- Values outside the edges given are left out of every count.
- All values the same: the one range is widened by 0.5 on each side.
- No data gives zero counts over 0 to 1, not an error.
- Two edges may be the same: that bin counts nothing.
- Bins can be 1 to 1,000,000.

```quillo
print(stats.histogram([1, 2, 3], [1, 2, 3]).counts)
print(stats.histogram([-1, 11, 10], [0, 5, 10]).counts)
print(stats.histogram([5, 5, 5], 2), stats.histogram([], 2))
print(stats.histogram([1, 10], [0, 5, 5, 10]).counts, stats.histogram([1, 2, 3, 4], 1))
```

```output
[1, 2]
[0, 1]
{ counts: [0, 3], edges: [4.5, 5.0, 5.5] } { counts: [0, 0], edges: [0.0, 0.5, 1.0] }
[1, 0, 1] { counts: [4], edges: [1.0, 4.0] }
```

### Errors

A bin count outside 1 to 1,000,000, fewer than two edges, edges that fall, or an
item that is not a number are each a runtime error, not an error value.

```quillo error
print(stats.histogram([1, 2], 0))
```

```output
line 1: `stats.histogram`: bins must be from 1 to 1000000, got 0
```

```quillo error
print(stats.histogram([1, 2], [2, 1]))
```

```output
line 1: `stats.histogram`: edges must be at least two, increasing
```

```quillo error
print(stats.histogram([1, "2"], 2))
```

```output
line 1: `stats.histogram` expects a list of numbers, but item 1 is str
```

### Chaining

In a pipeline the data comes first and the bins are the argument:

```quillo
let ages = [23, 35, 41, 29, 52, 38, 44, 60, 31, 27]
print(ages | stats.histogram(4) | get("counts"))
print(ages | stats.histogram([20, 30, 40, 50, 60, 70]) | get("counts"))
```

```output
[4, 3, 1, 2]
[3, 3, 2, 1, 1]
```

### See also

[stats.describe](/docs/reference/stats.describe/), [stats.quantiles](/docs/reference/stats.quantiles/), [count](/docs/reference/count/), [group_by](/docs/reference/group_by/)
