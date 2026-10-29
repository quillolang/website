# math.isqrt
math.isqrt(int) -> int
group: Math

### What it does

The integer square root: the largest int whose square is not above `n`, as Python's
`math.isqrt`. `math.isqrt(17)` is `4`. It is exact for every int, where
`math.floor(math.sqrt(n))` can be off by one for ints past 2⁵³.

### Examples

```quillo
print(math.isqrt(0), math.isqrt(1), math.isqrt(15), math.isqrt(16), math.isqrt(17))
print(type_of(math.isqrt(17)), math.sqrt(17))
```

```output
0 1 3 4 4
int 4.123105625617661
```

### Edge cases

- Exact up to the largest int: `math.isqrt(9223372036854775807)` is `3037000499`.
- A perfect square gives its root exactly; `math.isqrt(n) * math.isqrt(n) == n` tests
  for one.
- A float that is a whole number is accepted: `math.isqrt(16.0)` is `4`.

```quillo
print(math.isqrt(9223372036854775807))
let square = (n) => math.isqrt(n) * math.isqrt(n) == n
print(square(144), square(145), math.isqrt(16.0))
```

```output
3037000499
true false 4
```

### Errors

A negative number is a runtime error, not an error value, with a message that says
so, as Python's `ValueError`. A fraction, text or `null` is a runtime error as well.

```quillo error
print(math.isqrt(-1))
```

```output
line 1: `math.isqrt` is not defined for negative numbers (-1)
```

```quillo error
print(math.isqrt(2.5))
```

```output
line 1: `math.isqrt` expects an int as argument 1, got float
```

### Chaining

In a pipeline the number comes first:

```quillo
print(1000000 | math.isqrt)
print([1, 2, 3, 4, 5] | map(math.isqrt))
```

```output
1000
[1, 1, 1, 2, 2]
```

### See also

[math.sqrt](/docs/reference/math.sqrt/), [math.floor](/docs/reference/math.floor/), [math.gcd](/docs/reference/math.gcd/)
