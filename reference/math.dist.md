# math.dist
math.dist(list, list) -> float
group: Math

### What it does

The Euclidean distance between two points, each a list of numbers of the same length,
as a float, as Python's `math.dist`. Ints and floats mix freely. As with
[math.hypot](/docs/reference/math.hypot/), the squares are never formed outright, so
large coordinates do not overflow.

### Examples

```quillo
print(math.dist([0, 0], [3, 4]), math.dist([1, 2, 3], [4, 6, 3]))
print(math.dist([1], [4]), math.dist([1.5, 2], [1, 2]))
```

```output
5.0 5.0
3.0 0.5
```

### Edge cases

- The order of the points does not matter; the same point twice gives `0.0`.
- In one dimension it is the absolute difference.
- Two empty points are `0.0` apart, and `null` counts as an empty point.
- `1e200` apart does not overflow; an infinite coordinate gives `inf`. A `NaN`
  coordinate gives `NaN` when another coordinate differs, and `0.0` when none does
  (Python gives `NaN` there).

```quillo
print(math.dist([3, 4], [0, 0]), math.dist([3, 4], [3, 4]))
print(math.dist([4], [1]))
print(math.dist([], []), math.dist(null, null))
print(math.isfinite(math.dist([1e200], [-1e200])), math.dist([math.inf], [0]))
print(math.dist([math.nan, 1], [0, 0]), math.dist([math.nan], [0]))
```

```output
5.0 0.0
3.0
0.0 0.0
true inf
NaN 0.0
```

### Errors

Points of different lengths are a runtime error, not an error value: it stops the
request, and `??` does not catch it. An item that is not a number, or an argument that
is not a list, is a runtime error too.

```quillo error
print(math.dist([1, 2], [1]))
```

```output
line 1: `math.dist`: both points must have the same number of dimensions (2 and 1)
```

```quillo error
print(math.dist([1, "2"], [1, 2]))
```

```output
line 1: `math.dist` expects a list of numbers, but item 1 is str
```

```quillo error
print(math.dist(1, 2))
```

```output
line 1: `math.dist` expects a list as argument 1, got int
```

### Chaining

In a pipeline the first point comes first. The nearest of several points is the
smallest distance, or the point itself with `sort_by`:

```quillo
let here = [1, 1]
let points = [[5, 5], [2, 0], [1, 3]]
print(here | math.dist([4, 5]))
print(points | map((p) => math.dist(here, p)) | min)
print(points | sort_by((p) => math.dist(here, p)) | first)
```

```output
5.0
1.4142135623730951
[2, 0]
```

### See also

[math.hypot](/docs/reference/math.hypot/), [vec.norm](/docs/reference/vec.norm/), [vec.sub](/docs/reference/vec.sub/), [math.sqrt](/docs/reference/math.sqrt/), [sort_by](/docs/reference/sort_by/)
