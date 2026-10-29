# vec.linspace
vec.linspace(num, num, int=, bool=) -> list
group: Vectors

### What it does

`n` evenly spaced floats from `start` to `stop`, both included; `n` is 50 when left out.
With `endpoint` false, `stop` is left out and the step is `(stop - start) / n`, so the
list is the first `n` of `n + 1` points. The last item is exactly `stop` when the
endpoint is included.

### Examples

```quillo
print(vec.linspace(0, 1, 5))
print(vec.linspace(0, 1, 5, false))
print(vec.linspace(0, 10, 3))
print(len(vec.linspace(0, 1)))
```

```output
[0.0, 0.25, 0.5, 0.75, 1.0]
[0.0, 0.2, 0.4, 0.6000000000000001, 0.8]
[0.0, 5.0, 10.0]
50
```

### Edge cases

- `start` above `stop` counts down.
- `n` of 0 is the empty list; `n` of 1 is `[start]`; `n` of 2 is `[start, stop]`.
- The same `start` and `stop` repeats it `n` times.
- The items between are computed as `start + i * step`, so they carry float rounding
  (`0.6000000000000001`); only the ends are exact.
- `null` as `n` or `endpoint` means the default.

```quillo
print(vec.linspace(1, 0, 3))
print(vec.linspace(0, 1, 0), vec.linspace(0, 1, 1), vec.linspace(0, 1, 2))
print(vec.linspace(5, 5, 3))
print(vec.linspace(0, 0.3, 4))
print(vec.linspace(0, 1, 3, null))
```

```output
[1.0, 0.5, 0.0]
[] [0.0] [0.0, 1.0]
[5.0, 5.0, 5.0]
[0.0, 0.09999999999999999, 0.19999999999999998, 0.3]
[0.0, 0.5, 1.0]
```

### Errors

A negative `n`, or one over ten million, is a runtime error, not an error value; so are
an `n` that is not an int and a `start` or `stop` that is not a number.

```quillo error
print(vec.linspace(0, 1, -1))
```

```output
line 1: `vec.linspace`: -1 is not a count from 0 to 10000000
```

```quillo error
print(vec.linspace(0, 1, 2.5))
```

```output
line 1: `vec.linspace` expects an int as argument 3, got float
```

### Chaining

A grid of x values to evaluate a function on, for a chart:

```quillo
let xs = vec.linspace(0, math.pi, 5)
print(xs | map(math.sin) | vec.round(3))
print(vec.linspace(0, 100, 5, false) | vec.round)
```

```output
[0.0, 0.707, 1.0, 0.707, 0.0]
[0, 20, 40, 60, 80]
```

### See also

[vec.arange](/docs/reference/vec.arange/), [range](/docs/reference/range/), [vec.zeros](/docs/reference/vec.zeros/), [vec.full](/docs/reference/vec.full/)
