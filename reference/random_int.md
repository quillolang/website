# random_int
random_int(int, int) -> int
group: General

### What it does

An int from `lo` to `hi`, both ends included, different on each call. Like
[random](/docs/reference/random/) it is fast and predictable, so it is for dice, picks
and jitter, not for secrets. There is no seed.

### Examples

```quillo
let n = random_int(1, 6)
print(type_of(n), n >= 1, n <= 6)
let rolls = range(1000) | map((i) => random_int(1, 6))
print(rolls | min, rolls | max, rolls | unique | sort)
```

```output
int true true
1 6 [1, 2, 3, 4, 5, 6]
```

### Edge cases

- Both ends are included: `random_int(1, 6)` can be 6.
- `lo == hi` gives that number; negative ends are fine.
- Any int range works, however wide.

```quillo
print(random_int(3, 3), random_int(-5, -5), random_int(0, 0))
print(random_int(-1000000000000, 1000000000000) | type_of)
```

```output
3 -5 0
int
```

### Errors

`lo` above `hi` is a runtime error, not an error value, and so is an end that is not an
int: a float is refused, convert it with `int` first.

```quillo error
print(random_int(5, 1))
```

```output
line 1: `random_int` needs lo <= hi, got 5 and 1
```

```quillo error
print(random_int(1.5, 3))
```

```output
line 1: `random_int` expects an int as argument 1, got float
```

### Chaining

```quillo
let xs = ["ann", "bob", "cy"]
print(type_of(xs[random_int(0, len(xs) - 1)]))
print(range(3) | map((i) => random_int(10, 20)) | all((n) => n >= 10 && n <= 20))
```

```output
str
true
```

### See also

[random](/docs/reference/random/), [uuid](/docs/reference/uuid/), [range](/docs/reference/range/), [int](/docs/reference/int/)
