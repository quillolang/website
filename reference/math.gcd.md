# math.gcd
math.gcd(int | list...) -> int
group: Math

### What it does

The greatest common divisor of some ints, as Python's `math.gcd`: the largest int that
divides each of them. The ints come as separate arguments or as one list;
`math.gcd(12, 18)` and `math.gcd([12, 18])` are both `6`. The answer is never
negative.

### Examples

```quillo
print(math.gcd(12, 18), math.gcd(12, 18, 30), math.gcd([12, 18, 30]))
print(math.gcd(7, 13), math.gcd(-12, 18))
```

```output
6 6 6
1 6
```

### Edge cases

- Zero divides into anything: `math.gcd(0, 5)` is `5`, and `math.gcd(0, 0)` is `0`.
- One int gives its absolute value, and no ints at all (or an empty list) give `0`,
  as in Python.
- Negative ints count by their absolute value: `math.gcd(-4, -6)` is `2`.
- A float that is a whole number is accepted as an int.

```quillo
print(math.gcd(0, 5), math.gcd(0, 0), math.gcd(7), math.gcd(), math.gcd([]))
print(math.gcd(-4, -6), math.gcd(4, 6.0))
```

```output
5 0 7 0 0
2 2
```

### Errors

An argument that is not an int, or a list item that is not, is a runtime error, not an
error value; a float with a fraction and `null` are refused. A list may only be the
whole argument list: `math.gcd(12, [18])` fails.

```quillo error
print(math.gcd(4, 6.5))
```

```output
line 1: `math.gcd` expects an int as argument 2, got float
```

```quillo error
print(math.gcd(12, [18]))
```

```output
line 1: `math.gcd` expects an int as argument 2, got list
```

### Chaining

A list in a pipeline is the only argument, so `xs | math.gcd` reduces the whole list;
a number in a pipeline is the first of two:

```quillo
print([12, 18, 30] | math.gcd)
print(12 | math.gcd(18))
let [a, b] = [12, 18]
let g = math.gcd(a, b)
print(`${a / g}/${b / g}`)
```

```output
6
6
2/3
```

### See also

[math.lcm](/docs/reference/math.lcm/), [math.isqrt](/docs/reference/math.isqrt/), [math.factorial](/docs/reference/math.factorial/)
