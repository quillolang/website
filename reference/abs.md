# abs
abs(num | dec) -> num | dec
group: Math

### What it does

The absolute value: the number without its sign. The type is kept: an int gives an
int, a float a float, a decimal a decimal with its digits as they were.

### Examples

```quillo
print(abs(-5), abs(5), abs(-2.5), abs(0))
print(abs(-12.50m), abs(3 - 10))
```

```output
5 5 2.5 0
12.50 7
```

### Edge cases

- The type is the argument's: `abs(-5)` is the int `5`, `abs(-5.0)` the float `5.0`.
- A decimal keeps its trailing zeros: `abs(-12.50m)` is `12.50m`.
- `NaN` stays `NaN`; `-inf` becomes `inf`; `-0.0` is `0.0`.
- The smallest int has no positive twin: `abs` of it is an integer overflow.

```quillo
print(type_of(abs(-5)), type_of(abs(-2.5)), type_of(abs(-1m)))
print(abs(-12.50m), abs(float("nan")), abs(float("-inf")), abs(-0.0))
```

```output
int float dec
12.50 NaN inf 0.0
```

### Errors

A string, `null` or a boolean is a runtime error, not an error value; `abs` of the
smallest int is a runtime error too (`integer overflow`).

```quillo error
print(abs("x"))
```

```output
line 1: `abs` expects a number as argument 1, got str
```

```quillo error
print(abs(-9223372036854775807 - 1))
```

```output
line 1: integer overflow
```

### Chaining

```quillo
print([-1, 2, -3] | map(abs))
print(-7 | abs, abs(3 - 10) + 1)
print([3, -4] | map(abs) | max)
```

```output
[1, 2, 3]
7 8
4
```

### See also

[round](/docs/reference/round/), [floor](/docs/reference/floor/), [ceil](/docs/reference/ceil/), [sqrt](/docs/reference/sqrt/), [pow](/docs/reference/pow/)
