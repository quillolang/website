# math.log
math.log(num, num=) -> float
group: Math

### What it does

The natural logarithm of a number, as a float, as Python's `math.log`. With a second
argument, the logarithm to that base: `math.log(8, 2)` is `3.0`. The number must be
above zero, and the base above zero and not `1`.

### Examples

```quillo
print(math.log(1), math.log(math.e), math.log(10))
print(math.log(8, 2), math.log(100, 10), math.log(81, 3))
```

```output
0.0 1.0 2.302585092994046
3.0 2.0 4.0
```

### Edge cases

- With a base the answer is `ln(x) / ln(base)`, so it can miss by a digit:
  `math.log(1000, 10)` is `2.9999999999999996`. [math.log10](/docs/reference/math.log10/)
  and [math.log2](/docs/reference/math.log2/) are exact for those bases.
- A base between `0` and `1` is allowed and gives a negative answer.
- A number between `0` and `1` gives a negative answer; the smallest positive float is
  still fine.
- `inf` gives `inf`, `NaN` gives `NaN`, and a base of `inf` gives `0.0`.

```quillo
print(math.log(1000, 10), math.log10(1000))
print(math.log(8, 0.5))
print(math.log(0.5), math.log(5e-324))
print(math.log(math.inf), math.log(math.nan), math.log(8, math.inf))
```

```output
2.9999999999999996 3.0
-3.0
-0.6931471805599453 -744.4400719213812
inf NaN 0.0
```

### Errors

Zero or a negative number is a runtime error (a domain error), not an error value: it
stops the request, and `??` does not catch it, so test the value first when it can be
zero. A base of `1`, `0` or less is a domain error too, named as the base. A value that
is not a number is a runtime error; a decimal is converted first with `float`.

```quillo error
print(math.log(0))
```

```output
line 1: `math.log`: math domain error (0)
```

```quillo error
print(math.log(8, 1))
```

```output
line 1: `math.log`: math domain error (base 1)
```

```quillo error
print(math.log(-1))
```

```output
line 1: `math.log`: math domain error (-1)
```

### Chaining

In a pipeline the number comes first, so `x | math.log(2)` is the logarithm of `x` to
base 2. For a whole list, [vec.log](/docs/reference/vec.log/) takes the natural
logarithm of each item:

```quillo
print(1024 | math.log(2))
print([1, 10, 100] | map((x) => math.log(x, 10)), vec.log([1, math.e]))
print(math.exp(2) | math.log)
```

```output
10.0
[0.0, 1.0, 2.0] [0.0, 1.0]
2.0
```

### See also

[math.log2](/docs/reference/math.log2/), [math.log10](/docs/reference/math.log10/), [math.log1p](/docs/reference/math.log1p/), [math.exp](/docs/reference/math.exp/), [vec.log](/docs/reference/vec.log/)
