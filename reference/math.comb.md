# math.comb
math.comb(int, int) -> int
group: Math

### What it does

The number of ways to choose `k` items from `n` without regard to order, the binomial
coefficient, as an int, as Python's `math.comb`: `math.comb(52, 5)` is `2598960`, the
poker hands. It is computed without the full factorials, so it reaches well past where
`math.factorial(n)` overflows.

### Examples

```quillo
print(math.comb(52, 5), math.comb(5, 2), math.comb(10, 3))
print(math.comb(10, 3) == math.comb(10, 7))
```

```output
2598960 10 120
true
```

### Edge cases

- `k` greater than `n` gives `0`, not an error.
- `k` of `0` or of `n` gives `1`, and `math.comb(0, 0)` is `1`.
- The result is an int of 64 bits: `math.comb(66, 33)` fits and `math.comb(67, 33)` is
  a runtime error, `integer overflow`, as is `math.comb(100, 50)`. Python's result grows
  without bound.
- A float that is a whole number is accepted as an int.

```quillo
print(math.comb(5, 6), math.comb(5, 0), math.comb(5, 5), math.comb(0, 0))
print(math.comb(66, 33), math.comb(30, 15.0))
```

```output
0 1 1 1
7219428434016265740 155117520
```

```quillo error
print(math.comb(100, 50))
```

```output
line 1: integer overflow
```

### Errors

A negative `n` or `k` is a runtime error, not an error value, with a message that says
so, as Python's `ValueError`. A fraction, text or `null` is a runtime error as well.

```quillo error
print(math.comb(-1, 2))
```

```output
line 1: `math.comb` is not defined for negative numbers (-1)
```

```quillo error
print(math.comb(5, 2.5))
```

```output
line 1: `math.comb` expects an int as argument 2, got float
```

### Chaining

In a pipeline `n` comes first, so `n | math.comb(k)`. A row of Pascal's triangle:

```quillo
print(52 | math.comb(5))
print(range(0, 6) | map((k) => math.comb(5, k)))
```

```output
2598960
[1, 5, 10, 10, 5, 1]
```

### See also

[math.perm](/docs/reference/math.perm/), [math.factorial](/docs/reference/math.factorial/), [math.lgamma](/docs/reference/math.lgamma/)
