# math.ldexp
math.ldexp(num, int) -> float
group: Math

### What it does

`x * 2^e`, as a float, as Python's `math.ldexp`: the inverse of
[math.frexp](/docs/reference/math.frexp/). `math.ldexp(0.5, 4)` is `8.0`. Scaling by
a power of two is exact, so no precision is lost as long as the result is a normal
float.

### Examples

```quillo
print(math.ldexp(0.5, 4), math.ldexp(3, 2), math.ldexp(1, -1), math.ldexp(1.5, 0))
let [m, e] = math.frexp(10)
print(math.ldexp(m, e))
```

```output
8.0 12.0 0.5 1.5
10.0
```

### Edge cases

- The result is a float even when it is whole: `math.ldexp(3, 2)` is `12.0`.
- A huge negative exponent underflows to `0.0` silently: `2^-1074` is the smallest
  float, `2^-1075` is `0.0`.
- Zero times any power is `0.0`, and infinity stays infinity, however large the
  exponent.
- A float that is a whole number is accepted as the exponent.

```quillo
print(math.ldexp(1, -1074) > 0, math.ldexp(1, -1075))
print(math.ldexp(0, 100000), math.ldexp(float("inf"), 1), math.ldexp(1, 2.0))
```

```output
true 0.0
0.0 inf 4.0
```

### Errors

A result too large for a float is a runtime error, `math range error`, not infinity
and not an error value: `math.ldexp(1, 1024)` fails while `math.ldexp(1, 1023)` is the
largest power of two. An exponent that is not a whole number, or a first argument
that is not a number, is a runtime error as well.

```quillo error
print(math.ldexp(1, 1024))
```

```output
line 1: `math.ldexp`: math range error (1)
```

```quillo error
print(math.ldexp(1, 0.5))
```

```output
line 1: `math.ldexp` expects an int as argument 2, got float
```

### Chaining

In a pipeline the number comes first, so `x | math.ldexp(e)` scales `x` by `2^e`:

```quillo
print(3 | math.ldexp(3))
print([1, 2, 3] | map((x) => math.ldexp(x, 10)))
```

```output
24.0
[1024.0, 2048.0, 3072.0]
```

### See also

[math.frexp](/docs/reference/math.frexp/), [math.pow](/docs/reference/math.pow/), [math.exp2](/docs/reference/math.exp2/)
