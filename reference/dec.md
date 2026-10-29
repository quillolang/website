# dec
dec(any) -> dec | error(str)
group: Decimals and money

### What it does

The value as a decimal: an exact number with a fixed count of decimals, for money and
whatever else is counted in cents. Text is read exactly and keeps its digits
(`dec("1.50")` is `1.50`, not `1.5`); an int is itself; a float goes through its
shortest text, so `dec(0.1)` is `0.1`, not `0.1000000000000000055…`. What cannot be a
decimal is an error value, not a runtime error, so the result can be checked with
`is_err` or given a default with `??`. Arithmetic between decimals and ints is exact;
a float next to a decimal is a runtime error.

### Examples

```quillo
print(dec("1.50"), dec(42), dec(0.1), dec("-0.01"))
print(dec("1.50") + dec("2"), dec("1.10") * 3, dec("10") / 4)
print(dec(0.1) + dec(0.2) == dec("0.3"), 0.1 + 0.2)
print(dec("1.50") == dec("1.5"), str(dec("1.50")))
```

```output
1.50 42 0.1 -0.01
3.50 3.30 2.5
true 0.30000000000000004
true 1.50
```

### Edge cases

- The digits are kept through arithmetic: `1.50 * 1.0` is `1.500`. Equality and order do
  not see zeros at the end, so `dec("12.5") == dec("12.50")`.
- Text may have spaces around it and an exponent (`"1e3"` is `1000`); a comma, an
  underscore or the empty string is not a decimal. Only ASCII digits are read.
- A decimal holds up to 28 decimals and a whole part of 29 digits (about 7.9 × 10²⁸).
  Text past that is an error value; so is a float past it, `NaN` or an infinity.
- `null`, a boolean, a list or a map are errors, not 0.
- Division gives up to 28 decimals, rounded half to even: `dec("1") / 3` is
  `0.3333333333333333333333333333`.
- On its own `print` writes the digits; inside a list or a map a decimal shows as it is
  written in a program, with an `m` after it (`1.50m`).

```quillo
print(dec("1.50") * dec("1.0"), dec("12.5") == dec("12.50"))
print(dec("  7.25 "), dec("1e3"), dec("1,5"), dec(""))
print(dec("79228162514264337593543950335"))
print(dec("79228162514264337593543950336"), dec(1e29), dec(float("nan")))
print(dec(null), dec(true), dec("1") / 3)
print([dec("1.50")], { price: dec("1.50") })
```

```output
1.500 true
7.25 1000 err("not a decimal: \"1,5\"") err("not a decimal: \"\"")
79228162514264337593543950335
err("not a decimal: \"79228162514264337593543950336\"") err("cannot convert float to dec: it is too large, or not a number") err("cannot convert float to dec: it is too large, or not a number")
err("cannot convert null to dec") err("cannot convert bool to dec") 0.3333333333333333333333333333
[1.50m] { price: 1.50m }
```

### Errors

Text, a float or another value that is not a decimal gives an error value whose text
says what was given. Mixing a decimal with a float (`dec("1.5") + 0.5`), a result whose
whole part no longer fits (`decimal overflow`) and dividing by zero are runtime errors,
not error values: they stop the request.

```quillo
let d = dec("abc")
print(is_err(d), d.error, dec("abc") ?? dec(0))
```

```output
true not a decimal: "abc" 0
```

```quillo error
print(dec("1.5") + 0.5)
```

```output
line 1: cannot add dec and float: a dec is exact and a float is not, so convert one with dec(x) or float(x)
```

```quillo error
print(dec("79228162514264337593543950335") + dec("1"))
```

```output
line 1: decimal overflow
```

### Chaining

In a pipeline the value comes first, so `dec` takes it as its only argument. A list of
text becomes a list of decimals with `map(dec)`, and `sum` keeps the sum exact:

```quillo
print("19.99" | dec | round(1))
print(["1.50", "2.25"] | map(dec) | sum)
print(["1.5", "x", "2"] | map(dec) | filter((v) => !is_err(v)))
```

```output
20.0
3.75
[1.5m, 2m]
```

### See also

[int](/docs/reference/int/), [float](/docs/reference/float/), [str](/docs/reference/str/), [round](/docs/reference/round/), [is_err](/docs/reference/is_err/), [money.of](/docs/reference/money.of/), [format_number](/docs/reference/format_number/)
