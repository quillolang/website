# math.perm
math.perm(int, int | null=) -> int
group: Math

### What it does

The number of ways to pick `k` items from `n` in order, `n! / (n - k)!`, as an int, as
Python's `math.perm`: `math.perm(5, 2)` is `20`. Without `k`, or with `k` of `null`, it
is `n!`, all the orderings of `n` items.

### Examples

```quillo
print(math.perm(5, 2), math.perm(5), math.perm(5, null))
print(math.perm(10, 3) == math.comb(10, 3) * math.factorial(3))
```

```output
20 120 120
true
```

### Edge cases

- `k` greater than `n` gives `0`, not an error.
- `k` of `0` gives `1`; `math.perm(0)` is `1` as well.
- The result is an int of 64 bits: `math.perm(20)` fits, `math.perm(21)` is a runtime
  error, `integer overflow`, and so is any `n`, `k` pair whose product passes about
  9.2 × 10¹⁸. Python's result grows without bound.
- A float that is a whole number is accepted as an int.

```quillo
print(math.perm(5, 6), math.perm(5, 0), math.perm(0), math.perm(0, 0))
print(math.perm(20), math.perm(100, 2), math.perm(6.0, 2))
```

```output
0 1 1 1
2432902008176640000 9900 30
```

```quillo error
print(math.perm(21))
```

```output
line 1: integer overflow
```

### Errors

A negative `n` or `k` is a runtime error, not an error value, with a message that says
so, as Python's `ValueError`. A fraction, text or `null` for `n` is a runtime error as
well.

```quillo error
print(math.perm(5, -1))
```

```output
line 1: `math.perm` is not defined for negative numbers (-1)
```

```quillo error
print(math.perm("5"))
```

```output
line 1: `math.perm` expects an int as argument 1, got str
```

### Chaining

In a pipeline `n` comes first, so `n | math.perm(k)`:

```quillo
print(10 | math.perm(3))
print(range(1, 6) | map(math.perm))
```

```output
720
[1, 2, 6, 24, 120]
```

### See also

[math.comb](/docs/reference/math.comb/), [math.factorial](/docs/reference/math.factorial/), [math.prod](/docs/reference/math.prod/)
