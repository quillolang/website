# money.format
money.format(map, str | null=) -> str
group: Decimals and money

### What it does

The amount written for people, as CLDR has it for a locale and as `Intl.NumberFormat`
writes it in a browser: `$1,234.50` in en-US, `1.234,50 €` in de-DE, `1 234,50 €` in
fr-FR, `￥1,235` in ja-JP, `₹12,34,567.00` in en-IN. Without a locale, or with `null`,
it writes in the program's locale (the request's, with `translations`), else en-US.
Common currencies get their symbol; the others are written with their code.

### Examples

```quillo
let m = money.of("1234.5", "USD")
print(money.format(m), money.format(m, "de-DE"), money.format(m, "fr-FR"), money.format(m, "en-IN"))
print(money.format(money.of(1235, "JPY"), "ja-JP"), money.format(money.of("1234.5", "EUR"), "de-DE"), money.format(money.of("1234.5", "GBP"), "en-GB"))
print(money.format(money.of("1234567.89", "USD"), "en-IN"), money.format(money.of("1234567.89", "USD"), "es-ES"))
```

```output
$1,234.50 1.234,50 $ 1 234,50 $US $1,234.50
￥1,235 1.234,50 € £1,234.50
$12,34,567.89 1.234.567,89 US$
```

### Edge cases

- The currency's decimals are always written, zero or not: `$0.00`, `¥1,235`,
  `KWD 1,234.567`.
- A symbol is the locale's: USD is `$` in en-US, `$US` in fr-FR and `US$` in es-ES; CAD
  is `CA$` in en-US and `$` in en-CA. A currency without a symbol is written with its
  code: `XOF 1,235`.
- A negative amount takes the locale's minus: `-$1,234.50`, `-1.234,50 €`.
- The spaces are the locale's: fr-FR puts a narrow no-break space between thousands
  and before the symbol, so `len` counts 13 characters in `-1 234,50 $US`.
- A locale that is not covered falls back: a region to the first locale of its
  language (`de-LU` as de-DE, `fr` as fr-FR), and anything else to en-US.
- A map made by hand is rounded half to even to the currency's decimals first.
- Without a locale argument, a program with `translations` writes in the current
  locale; `with_locale` changes it for a call.

```quillo
print(money.format(money.zero("USD")), money.format(money.of(1235, "JPY")), money.format(money.of("1234.567", "KWD")))
print(money.format(money.of("1234.5", "CAD"), "en-US"), money.format(money.of("1234.5", "CAD"), "en-CA"), money.format(money.of(1235, "XOF")), money.format(money.of(1235, "XOF"), "fr-FR"))
let m = money.of("-1234.5", "USD")
print(money.format(m), money.format(money.of("-1234.5", "EUR"), "de-DE"), len(money.format(m, "fr-FR")))
print(money.format(m, "de-LU"), money.format(m, "fr"), money.format(m, "xx-YY"), money.format(m, null))
print(money.format({ amount: "1.005", currency: "USD" }), money.format({ amount: 12, currency: "USD" }))
```

```output
$0.00 ¥1,235 KWD 1,234.567
CA$1,234.50 $1,234.50 XOF 1,235 1 235 XOF
-$1,234.50 -1.234,50 € 13
-1.234,50 $ -1 234,50 $US -$1,234.50 -$1,234.50
$1.00 $12.00
```

```quillo
translations({ en: { hi: "Hi" }, "de-DE": { hi: "Hallo" } })
print(money.format(money.of("1234.5", "EUR")))
print(with_locale("de-DE", () => money.format(money.of("1234.5", "EUR"))))
```

```output
€1,234.50
1.234,50 €
```

### Errors

A value that is not money, or a locale that is not text, is a runtime error, not an
error value. An unknown locale is not an error: it is written as en-US.

```quillo error
print(money.format("1.00"))
```

```output
line 1: `money.format` expects money ({ amount, currency }) as argument 1, got str "1.00"
```

```quillo error
print(money.format(money.of(1, "USD"), 5))
```

```output
line 1: `money.format` expects a locale (a str) as argument 2, got int 5
```

### Chaining

`money.format` closes a pipeline, the amount first and the locale as its argument:

```quillo
print("19.99" | money.of("USD") | money.mul(3) | money.format("de-DE"))
print([money.of(1, "USD"), money.of("2.5", "USD")] | map(money.format))
print(money.allocate(money.of(100, "EUR"), 3) | map((s) => money.format(s, "fr-FR")))
```

```output
59,97 $
["$1.00", "$2.50"]
["33,34 €", "33,33 €", "33,33 €"]
```

### See also

[format_number](/docs/reference/format_number/), [money.of](/docs/reference/money.of/), [money.round](/docs/reference/money.round/), [locale](/docs/reference/locale/), [with_locale](/docs/reference/with_locale/), [translations](/docs/reference/translations/)
