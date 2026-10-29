# math.fsum
math.fsum(list | null) -> float
group: Math

### What it does

The sum of a list of numbers as a float, rounded once at the end, as Python's
`math.fsum` (Shewchuk's algorithm): every item's bits count, so the answer is the
exactly rounded sum where [sum](/docs/reference/sum/) accumulates rounding errors.
`math.fsum([0.1, 0.2, 0.3])` is `0.6`; `sum` of the same list is
`0.6000000000000001`. A long list is summed on all the cores and still gives the one
exact answer.

### Examples

```quillo
print(math.fsum([0.1, 0.2, 0.3]), sum([0.1, 0.2, 0.3]))
print(math.fsum([1e100, 1.0, -1e100]), sum([1e100, 1.0, -1e100]))
print(math.fsum([1, 2, 3]), type_of(math.fsum([1, 2, 3])))
```

```output
0.6 0.6000000000000001
1.0 0.0
6.0 float
```

### Edge cases

- An empty list, or `null`, gives `0.0`.
- Ints are summed as floats, so the result is a float even for ints, and ints past
  2⁵³ lose precision; use `sum` for an exact int total.
- Infinity sums to infinity, and infinity with minus infinity is NaN, as in Python.
- A sum whose partials overflow the largest float gives `0.0` rather than an error:
  `math.fsum([1e308, 1e308])` is `0.0`, where Python raises `OverflowError` and `sum`
  gives `inf`.

```quillo
print(math.fsum([]), math.fsum(null), math.fsum([9007199254740993]))
let inf = float("inf")
print(math.fsum([inf, 1]), math.fsum([inf, -inf]))
print(math.fsum([1e308, 1e308]), sum([1e308, 1e308]))
```

```output
0.0 0.0 9007199254740992.0
inf NaN
0.0 inf
```

### Errors

A list item that is not a number is a runtime error, not an error value, and the
message says which item; so is an argument that is not a list or `null`.

```quillo error
print(math.fsum([1, "x"]))
```

```output
line 1: `math.fsum` expects a list of numbers, but item 1 is str
```

### Chaining

A list in a pipeline is the only argument. The total of a column of floats, then on to
the next step:

```quillo
print([0.1, 0.2, 0.3] | math.fsum)
print([2.5, 3.5] | math.fsum | math.floor)
let rows = [{ amount: 12.5 }, { amount: 7.25 }, { amount: 0.1 }]
print(rows | map((r) => r.amount) | math.fsum)
```

```output
0.6
6
19.85
```

### See also

[sum](/docs/reference/sum/), [math.prod](/docs/reference/math.prod/), [math.sumprod](/docs/reference/math.sumprod/), [stats.mean](/docs/reference/stats.mean/), [vec.cumsum](/docs/reference/vec.cumsum/)
