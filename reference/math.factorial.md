# math.factorial
math.factorial(int) -> int
group: Math

### What it does

`n!`, the product of the ints from 1 to `n`, as an int, as Python's `math.factorial`.
`math.factorial(0)` is `1`. Quillo's ints are 64 bits and there is no bigint, so the
largest factorial that fits is `20!`; Python's grows without bound.

### Examples

```quillo
print(math.factorial(0), math.factorial(1), math.factorial(5))
print(math.factorial(20))
print(math.factorial(10) / (math.factorial(3) * math.factorial(7)))
```

```output
1 1 120
2432902008176640000
120
```

### Edge cases

- `21!` does not fit in an int: it is a runtime error, `integer overflow`, not a
  float and not a wrapped value. For the size of a large factorial use
  [math.lgamma](/docs/reference/math.lgamma/) (`lgamma(n + 1)` is `log(n!)`), or
  [math.gamma](/docs/reference/math.gamma/) up to `170!` as a float.
- A float that is a whole number is accepted: `math.factorial(5.0)` is `120`. A float
  with a fraction is not.
- `math.comb` and `math.perm` count without computing the full factorials, so they
  reach further than `n!` itself does.

```quillo
print(math.factorial(5.0), math.gamma(21), math.lgamma(21))
print(math.comb(30, 15))
```

```output
120 2432902008176640000 42.335616460753485
155117520
```

```quillo error
print(math.factorial(21))
```

```output
line 1: integer overflow
```

### Errors

A negative number is a runtime error, not an error value, with a message that says so;
Python raises `ValueError` there too. A fraction, text or `null` is a runtime error
as well.

```quillo error
print(math.factorial(-1))
```

```output
line 1: `math.factorial` is not defined for negative numbers (-1)
```

```quillo error
print(math.factorial(5.5))
```

```output
line 1: `math.factorial` expects an int as argument 1, got float
```

### Chaining

In a pipeline the number comes first:

```quillo
print(5 | math.factorial)
print(range(0, 6) | map(math.factorial))
```

```output
120
[1, 1, 2, 6, 24, 120]
```

### See also

[math.gamma](/docs/reference/math.gamma/), [math.lgamma](/docs/reference/math.lgamma/), [math.comb](/docs/reference/math.comb/), [math.perm](/docs/reference/math.perm/), [math.prod](/docs/reference/math.prod/)
