# math.fabs
math.fabs(num) -> float
group: Math

### What it does

The absolute value, always as a float, as Python's `math.fabs`: `math.fabs(-3)` is
`3.0`. [abs](/docs/reference/abs/) keeps an int an int and takes a decimal too; this
one is for float arithmetic.

### Examples

```quillo
print(math.fabs(-3), math.fabs(3.5), math.fabs(-2.25))
print(type_of(math.fabs(-3)), type_of(abs(-3)))
```

```output
3.0 3.5 2.25
float int
```

### Edge cases

- `-0.0` gives `0.0`.
- Infinity gives infinity, and NaN stays NaN; neither is an error.
- An int beyond 2⁵³ loses precision on the way to a float, as any int to float
  conversion does.

```quillo
print(math.fabs(-0.0), math.fabs(float("-inf")), math.fabs(float("nan")))
print(math.fabs(-9007199254740993))
```

```output
0.0 inf NaN
9007199254740992.0
```

### Errors

An argument that is not a number is a runtime error, not an error value. A decimal is
refused with a hint to convert it with `float`; [abs](/docs/reference/abs/) takes a
decimal as it is.

```quillo error
print(math.fabs("x"))
```

```output
line 1: `math.fabs` expects a number as argument 1, got str
```

```quillo error
print(math.fabs(dec("-1")))
```

```output
line 1: `math.fabs` expects a number as argument 1, got dec (this works on floats: convert a dec with float(x))
```

### Chaining

In a pipeline the number comes first. Differences become distances:

```quillo
print(-2.5 | math.fabs)
print([3, -1, 2] | map((x) => x - 2) | map(math.fabs))
```

```output
2.5
[1.0, 3.0, 0.0]
```

### See also

[abs](/docs/reference/abs/), [math.copysign](/docs/reference/math.copysign/), [vec.abs](/docs/reference/vec.abs/), [float](/docs/reference/float/)
