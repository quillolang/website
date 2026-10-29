# math.log2
math.log2(num) -> float
group: Math

### What it does

The logarithm of a number to base 2, as a float, as Python's `math.log2`. It is exact
for a power of two, and elsewhere a digit closer than `math.log(x, 2)`, which divides
two logarithms. The number must be
above zero.

### Examples

```quillo
print(math.log2(8), math.log2(1024), math.log2(0.5))
print(math.log2(10), math.log2(3))
```

```output
3.0 10.0 -1.0
3.321928094887362 1.584962500721156
```

### Edge cases

- A power of two gives a whole float: `math.log2(1024)` is `10.0`. For other numbers
  `math.log(x, 2)` can differ in the last digit.
- A number between `0` and `1` gives a negative answer; the smallest positive float is
  fine.
- `inf` gives `inf`, `NaN` gives `NaN`.
- The number of bits in a positive int is `math.floor(math.log2(n)) + 1`.

```quillo
print(math.log2(1024), math.log(1024, 2))
print(math.log2(10), math.log(10, 2))
print(math.log2(0.25), math.log2(5e-324))
print(math.log2(math.inf), math.log2(math.nan))
print(math.floor(math.log2(1024)) + 1, math.floor(math.log2(1023)) + 1)
```

```output
10.0 10.0
3.321928094887362 3.3219280948873626
-2.0 -1074.0
inf NaN
11 10
```

### Errors

Zero or a negative number is a runtime error (a domain error), not an error value: it
stops the request, and `??` does not catch it. A value that is not a number is a
runtime error too.

```quillo error
print(math.log2(0))
```

```output
line 1: `math.log2`: math domain error (0)
```

```quillo error
print(math.log2(-8))
```

```output
line 1: `math.log2`: math domain error (-8)
```

### Chaining

```quillo
print(256 | math.log2)
print([1, 2, 4, 8] | map(math.log2))
print(10 | math.exp2 | math.log2)
```

```output
8.0
[0.0, 1.0, 2.0, 3.0]
10.0
```

### See also

[math.log](/docs/reference/math.log/), [math.log10](/docs/reference/math.log10/), [math.exp2](/docs/reference/math.exp2/), [math.frexp](/docs/reference/math.frexp/)
