# math.prod
math.prod(list | null, num=) -> num
group: Math

### What it does

The product of a list of numbers, as Python's `math.prod`, times a start value that is
`1` by default. The result is an int while the list and the start are all ints, and a
float as soon as one of them is a float. An empty list gives the start value.

### Examples

```quillo
print(math.prod([2, 3, 4]), math.prod([2, 3.5]), math.prod([0.5, 4]))
print(math.prod([2, 3], 10), type_of(math.prod([2, 3])))
```

```output
24 7.0 2.0
60 int
```

### Edge cases

- An empty list, or `null`, gives the start: `1` without one, else what was given,
  so `math.prod([], 2.5)` is `2.5`, a float.
- A float start makes the result a float: `math.prod([2, 3], 1.0)` is `6.0`.
- Ints multiply exactly, and a product past what an int holds (about 9.2 × 10¹⁸) is a
  runtime error, `integer overflow`, not a float; Python's int would keep growing. A
  float product that overflows is `inf`, silently.
- `math.prod(range(1, n + 1))` is `math.factorial(n)`.

```quillo
print(math.prod([]), math.prod(null), math.prod([], 2.5), math.prod([2, 3], 1.0))
print(math.prod([1e308, 10]), math.prod(range(1, 6)) == math.factorial(5))
```

```output
1 1 2.5 6.0
inf true
```

```quillo error
print(math.prod([9223372036854775807, 2]))
```

```output
line 1: integer overflow
```

### Errors

A list item that is not a number is a runtime error, not an error value; so is an
argument that is not a list or `null`.

```quillo error
print(math.prod([2, "x"]))
```

```output
line 1: `math.prod` expects numbers, got str
```

```quillo error
print(math.prod(3))
```

```output
line 1: `math.prod` expects a list as argument 1, got int
```

### Chaining

A list in a pipeline is the first argument, so `xs | math.prod` multiplies it out:

```quillo
print([1, 2, 3, 4] | math.prod)
print([1.1, 1.05, 0.9] | math.prod | round(3))
```

```output
24
1.04
```

### See also

[sum](/docs/reference/sum/), [math.fsum](/docs/reference/math.fsum/), [math.sumprod](/docs/reference/math.sumprod/), [vec.cumprod](/docs/reference/vec.cumprod/), [math.factorial](/docs/reference/math.factorial/)
