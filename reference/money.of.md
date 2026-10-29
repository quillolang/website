# money.of
money.of(dec | int | str, str, str=) -> map | error(str)
group: Decimals and money

### What it does

An amount of money: a plain map `{ amount: dec, currency: "USD" }`, the amount with
exactly the currency's minor units (ISO 4217: USD 2, JPY 0, KWD 3). The amount is a
decimal, an int or text as people write one, the currency a code. An amount with more
decimals than the currency has is an error value, unless a rounding mode (those of
[round](/docs/reference/round/)) says how to round it. Bad text, an unknown currency
and an amount too large to count in minor units are error values too, so text from a
form can be checked with `??`. The map is plain, so JSON, the database and the browser
take it as it is.

### Examples

```quillo
print(money.of(dec("19.99"), "USD"))
print(money.of(42, "USD"), money.of("12.50", "EUR"))
print(money.of(1250, "JPY"), money.of("1.234", "KWD"))
print(money.of("12.345", "USD"), money.of("12.345", "USD", "half_up"))
```

```output
{ amount: 19.99m, currency: "USD" }
{ amount: 42.00m, currency: "USD" } { amount: 12.50m, currency: "EUR" }
{ amount: 1250m, currency: "JPY" } { amount: 1.234m, currency: "KWD" }
err("12.345 has more decimals than USD has (2); give a rounding mode to round it") { amount: 12.35m, currency: "USD" }
```

### Edge cases

- The modes are `half_even` (banker's rounding), `half_up`, `half_down`, `up`, `down`,
  `ceiling` and `floor`. Without one, a decimal that does not fit the currency is an
  error value, even `1.5` for a currency with no minor units.
- Text is trimmed and may have a sign, but not an exponent: `"1e3"` is not an amount,
  though `dec("1e3")` is a decimal.
- The code's case does not matter; the result carries it in upper case. A code that is
  not active money, such as XAU (gold), is unknown.
- The minor units must fit an int: USD goes up to `92233720368547758.07`.
- Negative amounts and zero are amounts.

```quillo
print(money.of(dec("1.5"), "JPY"), money.of(dec("2.5"), "JPY", "half_even"), money.of(dec("2.5"), "JPY", "half_up"))
print(money.of(" 12.5 ", "usd"), money.of("1e3", "USD"), money.of("abc", "USD"))
print(money.of(10, "XYZ"), money.of(10, "XAU"))
print(money.of("92233720368547758.07", "USD").amount, money.of("92233720368547758.08", "USD"))
print(money.of("-5.5", "USD"), money.of(0, "EUR"))
```

```output
err("1.5 has more decimals than JPY has (0); give a rounding mode to round it") { amount: 2m, currency: "JPY" } { amount: 3m, currency: "JPY" }
{ amount: 12.50m, currency: "USD" } err("not an amount: \"1e3\"") err("not an amount: \"abc\"")
err("unknown currency \"XYZ\"") err("unknown currency \"XAU\"")
92233720368547758.07 err("92233720368547758.08 USD is too large an amount")
{ amount: -5.50m, currency: "USD" } { amount: 0.00m, currency: "EUR" }
```

### Errors

What comes from data is an error value: bad text, too many decimals, an unknown
currency, too large an amount. What is the program's mistake is a runtime error: a
float amount (convert it with `dec`), a currency that is not text, a rounding mode that
is not one of the seven.

```quillo
let m = money.of("x", "USD")
print(is_err(m), m.error)
print(money.of("x", "USD") ?? money.zero("USD"))
```

```output
true not an amount: "x"
{ amount: 0.00m, currency: "USD" }
```

```quillo error
print(money.of(1.5, "USD"))
```

```output
line 1: `money.of` takes a dec, an int or text, not a float: convert it with dec(x)
```

```quillo error
print(money.of("1", "USD", "nearest"))
```

```output
line 1: `money.of`: unknown rounding "nearest" (one of half_even, half_up, half_down, up, down, ceiling or floor)
```

```quillo noexec
route POST /pay { form: { amount: str } } {
    let total = money.of(form.amount, "EUR") ?? reply 400 "not an amount"
    charge(total)
}
```

### Chaining

In a pipeline the amount comes first, so `"19.99" | money.of("USD")` reads as text
made money, and the result goes on to the other `money` functions:

```quillo
print("19.99" | money.of("USD") | money.format)
print(["1.50", "x", "2"] | map((t) => money.of(t, "USD")) | filter((m) => !is_err(m)) | len)
```

```output
$19.99
2
```

### See also

[money.from_minor](/docs/reference/money.from_minor/), [money.zero](/docs/reference/money.zero/), [money.round](/docs/reference/money.round/), [money.minor_units](/docs/reference/money.minor_units/), [money.format](/docs/reference/money.format/), [dec](/docs/reference/dec/), [is_err](/docs/reference/is_err/)
