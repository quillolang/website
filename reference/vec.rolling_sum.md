# vec.rolling_sum
vec.rolling_sum(list, int) -> list
group: Vectors

### What it does

The sum of each run of `window` neighbouring items, as a list of floats. Only full
windows count, so the result has `len(xs) - window + 1` items: the first is the sum of
the first `window` items, the last the sum of the last `window`.

### Examples

```quillo
print(vec.rolling_sum([1, 2, 3, 4, 5], 3))
print(vec.rolling_sum([1, 2, 3], 2))
```

```output
[6.0, 9.0, 12.0]
[3.0, 5.0]
```

### Edge cases

- The result is floats even for ints: `[3.0, 5.0]`, not `[3, 5]`.
- A window of 1 is the list itself, as floats; a window as long as the list gives one
  item, the total.
- A window longer than the list gives the empty list; so do the empty list and `null`.
- The sums are compensated: `[0.1, 0.2]` with a window of 2 gives
  `0.30000000000000004`, the float nearest 0.3 after one rounding, the same as `0.1 +
  0.2`.

```quillo
print(vec.rolling_sum([1, 2, 3], 1), vec.rolling_sum([1, 2, 3], 3))
print(vec.rolling_sum([1, 2, 3], 4), vec.rolling_sum([], 2), vec.rolling_sum(null, 1))
print(vec.rolling_sum([0.1, 0.2, 0.3], 2))
```

```output
[1.0, 2.0, 3.0] [6.0]
[] [] []
[0.30000000000000004, 0.5]
```

### Errors

A window below 1, a missing window, a window that is not an int, an item that is not an
int or a float, or a first argument that is not a list are runtime errors, not error
values.

```quillo error
print(vec.rolling_sum([1, "a"], 1))
```

```output
line 1: `vec.rolling_sum` expects a list of numbers, but item 1 is str
```

```quillo error
print(vec.rolling_sum([1, 2], 1.5))
```

```output
line 1: `vec.rolling_sum` expects an int as argument 2, got float
```

### Chaining

The best three days in a row, and where they start:

```quillo
let sales = [3, 5, 4, 6, 8, 2]
let threes = sales | vec.rolling_sum(3)
print(threes)
print(max(threes), vec.argmax(threes))
```

```output
[12.0, 15.0, 18.0, 16.0]
18.0 2
```

### See also

[vec.rolling_mean](/docs/reference/vec.rolling_mean/), [vec.cumsum](/docs/reference/vec.cumsum/), [sum](/docs/reference/sum/), [vec.argmax](/docs/reference/vec.argmax/)
