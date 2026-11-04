# money.format
money.format(map, str | null=) -> str
group: Decimals and money

### What it does

The amount written for people, as CLDR has it for a locale and as `Intl.NumberFormat`
writes it in a browser: `$1,234.50` in en-US, `1.234,50 €` in de-DE, `1 234,50 €` in
fr-FR, `￥1,235` in ja-JP, `₹12,34,567.00` in en-IN. Without a locale, or with `null`,
it writes in the program's locale (the request's, with `translations`), else en-US.
122 locales are covered, from ICU 77's data, and every currency is written with the
symbol each of them gives it, or with its code where the locale has none. What it
writes, [money.parse](/docs/reference/money.parse/) reads back.

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

- The currency's decimals are written, zero or not: `$0.00`, `¥1,235`,
  `KWD 1,234.567`. A currency that CLDR shows without decimals (IRR, IQD, LBP and a few
  others) is written without them, rounded half away from zero, as `Intl.NumberFormat`
  does: `IRR 1,235` for `1234.5`. The amount keeps its minor units.
- A symbol is the locale's: USD is `$` in en-US, `$US` in fr-FR and `US$` in es-ES; CAD
  is `CA$` in en-US and `$` in en-CA; XOF is `F CFA`; the Chilean peso is `$CL` in
  fr-FR. A currency the locale gives no symbol is written with its code.
- A negative amount takes the locale's minus: `-$1,234.50`, `-1.234,50 €`.
- The spaces are the locale's: fr-FR puts a narrow no-break space between thousands
  and before the symbol, so `len` counts 13 characters in `-1 234,50 $US`.
- A locale's name is matched in any case, with `_` for `-`, and its `-u-` extensions
  are left out (`de-DE-u-nu-arab` is de-DE). A language alone is its first locale (`fr`
  as fr-FR). Chinese goes by its script (`zh-Hant` as zh-TW); Spanish of Latin America
  is es-419 (`es-HN`) and Portuguese of Africa and Asia pt-PT (`pt-CV`), as in CLDR.
- A locale that is not covered is written as the first of its language (`fr-XX` as
  fr-FR), else as en-US, and the log says so once for each name.
- A map made by hand is read as `money.of` reads an amount: more decimals than the
  currency has is a runtime error, not rounded. Round it first with `money.round`.
- Without a locale argument, a program with `translations` writes in the current
  locale; `with_locale` changes it for a call.

```quillo
print(money.format(money.zero("USD")), money.format(money.of(1235, "JPY")), money.format(money.of("1234.567", "KWD")))
print(money.format(money.of("1234.5", "CAD"), "en-US"), money.format(money.of("1234.5", "CAD"), "en-CA"), money.format(money.of(1235, "XOF")), money.format(money.of(1235, "XOF"), "fr-FR"))
print(money.format(money.of(1000, "CLP"), "fr-FR"), money.format(money.of("1234.5", "IRR")), money.format(money.of("1234.56", "IQD")), money.of("1234.56", "IRR").amount)
let m = money.of("-1234.5", "USD")
print(money.format(m), money.format(money.of("-1234.5", "EUR"), "de-DE"), len(money.format(m, "fr-FR")))
print(money.format(m, "zh-Hant"), money.format(m, "es-HN"), money.format(m, "pt-CV"), money.format(m, "de-DE-u-nu-arab"))
print(money.format(m, "fr"), money.format(m, "fr-XX"), money.format(m, "xx-YY"), money.format(m, null))
print(money.format({ amount: 12, currency: "usd" }), money.format({ amount: " 0.5 ", currency: "EUR" }, "de-DE"))
```

```output
$0.00 ¥1,235 KWD 1,234.567
CA$1,234.50 $1,234.50 F CFA 1,235 1 235 F CFA
1 000 $CL IRR 1,235 IQD 1,235 1234.56
-$1,234.50 -1.234,50 € 13
-US$1,234.50 -USD 1,234.50 -1234,50 US$ -1.234,50 $
-1 234,50 $US -1 234,50 $US -$1,234.50 -$1,234.50
$12.00 0,50 €
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

A value that is not money (a map with more decimals than its currency has, too), or a
locale that is not text, is a runtime error, not an error value. An unknown locale is
not an error: it is written as en-US, and the log says so.

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

```quillo error
print(money.format({ amount: "1.005", currency: "USD" }))
```

```output
line 1: `money.format`: 1.005 has more decimals than USD has (2): round it first with money.round(m, mode)
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

[format_number](/docs/reference/format_number/), [money.parse](/docs/reference/money.parse/), [money.of](/docs/reference/money.of/), [money.round](/docs/reference/money.round/), [locale](/docs/reference/locale/), [with_locale](/docs/reference/with_locale/), [translations](/docs/reference/translations/)
