# money.zero
money.zero(str) -> map | error(str)
group: Decimals and money

### What it does

Nothing of a currency: `{ amount: 0.00, currency: "USD" }`, the zero written with the
currency's minor units (`0` for JPY, `0.000` for KWD). It is the start of a running
total and the default for an amount that was not given. An unknown currency is an
error value.

### Examples

```quillo
print(money.zero("USD"))
print(money.zero("JPY"), money.zero("KWD"))
print(money.add(money.zero("USD"), money.of("2.50", "USD")))
```

```output
{ amount: 0.00m, currency: "USD" }
{ amount: 0m, currency: "JPY" } { amount: 0.000m, currency: "KWD" }
{ amount: 2.50m, currency: "USD" }
```

### Edge cases

- The code's case does not matter; the result has it in upper case.
- An unknown code is an error value, as with [money.of](/docs/reference/money.of/).
- `money.is_zero` is true of it, and `money.format` writes it as `$0.00`.

```quillo
print(money.zero("eur"), money.zero("XYZ"))
print(money.is_zero(money.zero("USD")), money.format(money.zero("USD")))
```

```output
{ amount: 0.00m, currency: "EUR" } err("unknown currency \"XYZ\"")
true $0.00
```

### Errors

A currency that is not text is a runtime error; text that is not a currency is an
error value.

```quillo error
print(money.zero(840))
```

```output
line 1: `money.zero` expects a currency code (a str) as argument 1, got int 840
```

```quillo
print(is_err(money.zero("XYZ")), money.zero("XYZ").error)
```

```output
true unknown currency "XYZ"
```

### Chaining

As the first value of a `reduce` it starts a total; after `??` it fills in a missing
amount:

```quillo
let lines = [money.of("9.99", "USD"), money.of("0.01", "USD")]
print(lines | reduce(money.zero("USD"), money.add))
print(money.of("x", "USD") ?? money.zero("USD"))
```

```output
{ amount: 10.00m, currency: "USD" }
{ amount: 0.00m, currency: "USD" }
```

### See also

[money.is_zero](/docs/reference/money.is_zero/), [money.of](/docs/reference/money.of/), [money.add](/docs/reference/money.add/), [money.minor_units](/docs/reference/money.minor_units/)
