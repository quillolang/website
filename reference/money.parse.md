# money.parse
money.parse(str, str, str | null=, str=) -> map | error(str)
group: Decimals and money

### What it does

An amount read as a locale writes it, made money of a currency: what a person types in
a form. `"1.234,50 €"` in de-DE is `1234.50` euros. It reads the locale's decimal mark
and group mark, Indian grouping in en-IN, a minus, and the currency's symbol or code
before or after the number, as [money.format](/docs/reference/money.format/) writes
them, so what `money.format` writes it reads back. Without a locale, or with `null`, it
reads in the program's locale (`locale()`, with `translations`), else en-US.
[money.of](/docs/reference/money.of/) reads text as a program writes it, where
`"1.000"` is one; here, in de-DE, it is a thousand. The rounding mode, if given, works
as in `money.of`.

### Examples

```quillo
print(money.parse("1.234,50 €", "EUR", "de-DE"))
print(money.parse("1.000", "EUR", "de-DE"), money.of("1.000", "EUR"))
print(money.parse("$1,234.50", "USD"), money.parse("1 234,50 $US", "USD", "fr-FR"), money.parse("¥1,235", "JPY", "ja-JP"))
print(money.parse("12.345", "USD", "en-US"), money.parse("12.345", "USD", "en-US", "half_up"))
```

```output
{ amount: 1234.50m, currency: "EUR" }
{ amount: 1000.00m, currency: "EUR" } { amount: 1.00m, currency: "EUR" }
{ amount: 1234.50m, currency: "USD" } { amount: 1234.50m, currency: "USD" } { amount: 1235m, currency: "JPY" }
err("12.345 has more decimals than USD has (2); give a rounding mode to round it") { amount: 12.35m, currency: "USD" }
```

### Edge cases

- Groups must be whole: in de-DE `"1.000"` is a thousand, and `"1.00"` is not an
  amount, since a German `.` is not a decimal mark. A mark of the other kind is refused
  too: `"1,5"` is not an amount in en-US.
- Group marks may be left out: `"1234,50"` reads in de-DE as `"1.234,50"` does.
- en-IN takes its own grouping and the plain one: `"1,00,000"` and `"1,000,000"`.
- The symbol or code may stand at either end, with or without a space: `"12 €"`,
  `"€12"`, `"EUR 12"`. Another currency's symbol is not an amount.
- A minus goes first, before or after the symbol. A plus, parentheses, a mark at either
  end (`".5"`, `"5."`) and an exponent are not amounts.
- More decimals than the currency has is an error value unless a mode says how to
  round, as with `money.of`. So is an amount whose minor units do not fit an int.
- A locale not covered reads as `money.format` writes it (`xx-YY` as en-US), and the
  log says so once.

```quillo
print(money.parse("1.00", "EUR", "de-DE"), money.parse("1,5", "USD", "en-US"))
print(money.parse("1234,50", "EUR", "de-DE"), money.parse("1,00,000", "INR", "en-IN"), money.parse("1,000,000", "INR", "en-IN"))
print(money.parse("12 €", "EUR"), money.parse("EUR 12", "EUR", "de-DE"), money.parse("€12", "USD"))
print(money.parse("-$1,234.50", "USD"), money.parse("+12", "USD"), money.parse("(12)", "USD"), money.parse("1e3", "USD"))
print(money.parse("12.5", "JPY", "ja-JP"), money.parse("12.5", "JPY", "ja-JP", "half_even"))
let m = money.of("-1234567.5", "EUR")
print(money.parse(money.format(m, "fr-FR"), "EUR", "fr-FR") == m, money.parse(money.format(m, "de-CH"), "EUR", "de-CH") == m)
```

```output
err("not an amount: \"1.00\"") err("not an amount: \"1,5\"")
{ amount: 1234.50m, currency: "EUR" } { amount: 100000.00m, currency: "INR" } { amount: 1000000.00m, currency: "INR" }
{ amount: 12.00m, currency: "EUR" } { amount: 12.00m, currency: "EUR" } err("not an amount: \"€12\"")
{ amount: -1234.50m, currency: "USD" } err("not an amount: \"+12\"") err("not an amount: \"(12)\"") err("not an amount: \"1e3\"")
err("12.5 has more decimals than JPY has (0); give a rounding mode to round it") { amount: 12m, currency: "JPY" }
true true
```

### Errors

What comes from the person is an error value, so text from a form can be checked with
`??`: text that is not an amount (`not an amount: ...`), too many decimals, too large
an amount, and an unknown currency. What is the program's mistake is a runtime error:
a first argument that is not text, a currency or a locale that is not text, a rounding
mode that is not one of the seven.

```quillo
let m = money.parse("12,50", "USD", "en-US")
print(is_err(m), m.error)
print(money.parse("abc", "USD"), money.parse("12", "XYZ"))
print(money.parse("x", "EUR", "de-DE") ?? money.zero("EUR"))
```

```output
true not an amount: "12,50"
err("not an amount: \"abc\"") err("unknown currency \"XYZ\"")
{ amount: 0.00m, currency: "EUR" }
```

```quillo error
print(money.parse(12, "USD"))
```

```output
line 1: `money.parse` expects text as argument 1, got int 12
```

```quillo error
print(money.parse("12", "USD", "en-US", "nearest"))
```

```output
line 1: `money.parse`: unknown rounding "nearest" (one of half_even, half_up, half_down, up, down, ceiling or floor)
```

```quillo noexec
route POST /pay { form: { amount: str } } {
    let total = money.parse(form.amount, "EUR") ?? reply 400 "not an amount"
    charge(total)
}
```

### Chaining

In a pipeline the text comes first, so `"1.234,50 €" | money.parse("EUR", "de-DE")`
reads as text made money, and the result goes on to the other `money` functions:

```quillo
print("1.234,50 €" | money.parse("EUR", "de-DE") | money.format("de-DE"))
print(["1.234,50", "x", "2,5"] | map((t) => money.parse(t, "EUR", "de-DE")) | filter((m) => !is_err(m)) | map((m) => m.amount))
```

```output
1.234,50 €
[1234.50m, 2.50m]
```

### See also

[money.of](/docs/reference/money.of/), [money.format](/docs/reference/money.format/), [money.round](/docs/reference/money.round/), [locale](/docs/reference/locale/), [with_locale](/docs/reference/with_locale/), [is_err](/docs/reference/is_err/)
