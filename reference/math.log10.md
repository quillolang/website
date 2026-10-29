# math.log10
math.log10(num) -> float
group: Math

### What it does

The logarithm of a number to base 10, as a float, as Python's `math.log10`. It is
exact for a power of ten, where `math.log(x, 10)` can miss by a digit. The number must
be above zero.

### Examples

```quillo
print(math.log10(1000), math.log10(0.001), math.log10(2))
print(math.log10(1e300), math.log10(12345))
```

```output
3.0 -3.0 0.3010299956639812
300.0 4.091491094267951
```

### Edge cases

- A power of ten gives a whole float: `math.log10(1000)` is `3.0`.
- A number between `0` and `1` gives a negative answer; the smallest positive float is
  fine.
- `inf` gives `inf`, `NaN` gives `NaN`.
- The number of digits in a positive int is `math.floor(math.log10(n)) + 1`.

```quillo
print(math.log10(1000), math.log(1000, 10))
print(math.log10(0.5), math.log10(5e-324))
print(math.log10(math.inf), math.log10(math.nan))
print(math.floor(math.log10(12345)) + 1, math.floor(math.log10(99)) + 1)
```

```output
3.0 2.9999999999999996
-0.3010299956639812 -323.3062153431158
inf NaN
5 2
```

### Errors

Zero or a negative number is a runtime error (a domain error), not an error value: it
stops the request, and `??` does not catch it. A value that is not a number is a
runtime error too; a decimal is converted first with `float`.

```quillo error
print(math.log10(-5))
```

```output
line 1: `math.log10`: math domain error (-5)
```

```quillo error
print(math.log10(dec("100")))
```

```output
line 1: `math.log10` expects a number as argument 1, got dec (this works on floats: convert a dec with float(x))
```

### Chaining

```quillo
print(1000000 | math.log10)
print([1, 10, 100] | map(math.log10))
print(3 | math.pow(10) | math.log10)
```

```output
6.0
[0.0, 1.0, 2.0]
4.771212547196624
```

### See also

[math.log](/docs/reference/math.log/), [math.log2](/docs/reference/math.log2/), [math.log1p](/docs/reference/math.log1p/), [math.pow](/docs/reference/math.pow/)
