# money.from_minor
money.from_minor(int, str) -> map | error(str)
group: Decimals and money

### What it does

An amount from a whole number of its currency's minor units: `money.from_minor(1250,
"USD")` is 12.50 dollars, `money.from_minor(1250, "JPY")` 1250 yen and
`money.from_minor(1250, "KWD")` 1.250 dinars. It is the way back from
[money.to_minor](/docs/reference/money.to_minor/), for an amount kept as cents in an
integer column. An unknown currency is an error value.

### Examples

```quillo
print(money.from_minor(1250, "USD"))
print(money.from_minor(1250, "JPY"), money.from_minor(1250, "KWD"))
print(money.from_minor(1999, "EUR") | money.format("de-DE"))
```

```output
{ amount: 12.50m, currency: "USD" }
{ amount: 1250m, currency: "JPY" } { amount: 1.250m, currency: "KWD" }
19,99 €
```

### Edge cases

- A negative count is a negative amount; 0 is the currency's zero.
- Any int fits, up to the largest.
- The code's case does not matter; an unknown code is an error value, as with
  [money.of](/docs/reference/money.of/).
- The round trip through `money.to_minor` gives the count back.

```quillo
print(money.from_minor(-5, "EUR"), money.from_minor(0, "USD"))
print(money.from_minor(9223372036854775807, "USD"))
print(money.from_minor(1, "usd"), money.from_minor(1, "XYZ"))
print(money.to_minor(money.from_minor(1250, "USD")))
```

```output
{ amount: -0.05m, currency: "EUR" } { amount: 0.00m, currency: "USD" }
{ amount: 92233720368547758.07m, currency: "USD" }
{ amount: 0.01m, currency: "USD" } err("unknown currency \"XYZ\"")
1250
```

### Errors

The count must be an int: a float or text is a runtime error, not an error value.
Convert first with [int](/docs/reference/int/). A currency that is not text is a
runtime error too; one that is text but unknown is an error value.

```quillo error
print(money.from_minor("1250", "USD"))
```

```output
line 1: `money.from_minor` expects an int as argument 1, got str "1250"
```

```quillo
print(is_err(money.from_minor(1, "XYZ")), money.from_minor(1, "XYZ").error)
```

```output
true unknown currency "XYZ"
```

### Chaining

In a pipeline the count comes first. A column of cents read from the database becomes
money with `map`:

```quillo
print(1250 | money.from_minor("USD") | money.format)
print([100, 250, -75] | map((c) => money.from_minor(c, "USD")) | map((m) => m.amount))
```

```output
$12.50
[1.00m, 2.50m, -0.75m]
```

### See also

[money.to_minor](/docs/reference/money.to_minor/), [money.of](/docs/reference/money.of/), [money.minor_units](/docs/reference/money.minor_units/), [money.zero](/docs/reference/money.zero/), [int](/docs/reference/int/)
