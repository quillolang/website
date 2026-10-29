# math.lcm
math.lcm(int | list...) -> int
group: Math

### What it does

The least common multiple of some ints, as Python's `math.lcm`: the smallest positive
int that each of them divides. The ints come as separate arguments or as one list;
`math.lcm(4, 6)` and `math.lcm([4, 6])` are both `12`. The answer is never negative.

### Examples

```quillo
print(math.lcm(4, 6), math.lcm(4, 6, 10), math.lcm([4, 6]))
print(math.lcm(7, 13), math.lcm(-4, 6))
```

```output
12 60 12
91 12
```

### Edge cases

- Any zero makes the answer `0`: `math.lcm(0, 5)` is `0`.
- One int gives its absolute value, and no ints at all (or an empty list) give `1`,
  as in Python.
- Negative ints count by their absolute value.
- The multiple of many ints grows fast: past what an int holds (about
  9.2 × 10¹⁸) it is a runtime error, `integer overflow`, not a float.

```quillo
print(math.lcm(0, 5), math.lcm(7), math.lcm(), math.lcm([]), math.lcm(-4, -6))
print(math.lcm(range(1, 21)))
```

```output
0 7 1 1 12
232792560
```

```quillo error
print(math.lcm(range(1, 50)))
```

```output
line 1: integer overflow
```

### Errors

An argument that is not an int, or a list item that is not, is a runtime error, not an
error value. A list may only be the whole argument list.

```quillo error
print(math.lcm(4, "6"))
```

```output
line 1: `math.lcm` expects an int as argument 2, got str
```

### Chaining

A list in a pipeline is the only argument, so `xs | math.lcm` reduces the whole list;
a number in a pipeline is the first of two. The lowest common denominator of some
fractions:

```quillo
print([4, 6, 10] | math.lcm)
print(4 | math.lcm(6))
let denominators = [2, 3, 4]
print(denominators | math.lcm)
```

```output
60
12
12
```

### See also

[math.gcd](/docs/reference/math.gcd/), [math.prod](/docs/reference/math.prod/), [math.factorial](/docs/reference/math.factorial/)
