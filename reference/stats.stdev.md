# stats.stdev
stats.stdev(list, num | null=) -> float
group: Statistics

### What it does

The sample standard deviation of a list of numbers: the square root of
[stats.variance](/docs/reference/stats.variance/), as Python's `statistics.stdev`.
It is the `std` that [stats.describe](/docs/reference/stats.describe/) reports.
For the whole population use [stats.pstdev](/docs/reference/stats.pstdev/).

### Examples

```quillo
print(stats.stdev([1, 2, 3, 4]))
print(stats.stdev([1.5, 2.5, 2.5, 2.75, 3.25, 4.75]))
```

```output
1.2909944487358056
1.0810874155219827
```

### Edge cases

- At least two numbers are needed: one number is an error, not `0.0`.
- A constant list gives `0.0`.
- A second argument, a mean already known, is accepted, but the answer is the spread
  about the data's own mean whatever is given, as in Python before 3.11. Leave it
  out, or pass `null`.
- It is the square root of `stats.variance` exactly.

```quillo
print(stats.stdev([7, 7, 7]), stats.stdev([1, 2], 1.5), stats.stdev([1, 2], null))
print(stats.stdev([1, 2, 3, 4]) == math.sqrt(stats.variance([1, 2, 3, 4])))
print(stats.stdev([1, 2, 3, 4]) == stats.describe([1, 2, 3, 4]).std)
```

```output
0.0 0.7071067811865476 0.7071067811865476
true
true
```

### Errors

Fewer than two numbers is a runtime error, not an error value: an empty list, `null`
or a list of one stops the request. So does an item that is not a number.

```quillo error
print(stats.stdev([5]))
```

```output
line 1: `stats.stdev` requires at least 2 data points
```

### Chaining

```quillo
let xs = [2, 4, 4, 4, 5, 5, 7, 9]
print(xs | stats.stdev | round(3))
let m = stats.mean(xs)
let s = stats.stdev(xs)
print(xs | filter((x) => x > m + s))
```

```output
2.138
[9]
```

### See also

[stats.pstdev](/docs/reference/stats.pstdev/), [stats.variance](/docs/reference/stats.variance/), [stats.describe](/docs/reference/stats.describe/), [stats.zscore](/docs/reference/stats.zscore/)
