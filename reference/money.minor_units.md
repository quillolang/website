# money.minor_units
money.minor_units(str) -> int | error(str)
group: Decimals and money

### What it does

How many decimals a currency has, from ISO 4217: 2 for USD and EUR (cents), 0 for JPY
and KRW, 3 for KWD and BHD (fils). It is what `money.of` checks an amount against and
what `money.to_minor` counts in. A code that is not a currency is an error value.

### Examples

```quillo
print(money.minor_units("USD"), money.minor_units("JPY"), money.minor_units("KWD"))
print(money.minor_units("EUR"), money.minor_units("BHD"))
```

```output
2 0 3
2 3
```

### Edge cases

- The code's case and spaces around it do not matter.
- A code that is not active money, such as XAU (gold), is unknown, as a made-up code
  is: both are error values, not 0.

```quillo
print(money.minor_units("eur"), money.minor_units(" usd "))
print(money.minor_units("XYZ"), money.minor_units("XAU"))
```

```output
2 2
err("unknown currency \"XYZ\"") err("unknown currency \"XAU\"")
```

### Errors

A code that is not text is a runtime error; text that is not a currency is an error
value, checked with `is_err` or given a default with `??`.

```quillo error
print(money.minor_units(null))
```

```output
line 1: `money.minor_units` expects a currency code (a str) as argument 1, got null null
```

```quillo
print(is_err(money.minor_units("XYZ")), money.minor_units("XYZ") ?? 2)
```

```output
true 2
```

### Chaining

```quillo
print("JPY" | money.minor_units)
print(["USD", "JPY", "KWD"] | map(money.minor_units))
let known = ["USD", "XYZ", "EUR"] | filter((c) => !is_err(money.minor_units(c)))
print(known)
```

```output
0
[2, 0, 3]
["USD", "EUR"]
```

### See also

[money.of](/docs/reference/money.of/), [money.to_minor](/docs/reference/money.to_minor/), [money.from_minor](/docs/reference/money.from_minor/), [money.zero](/docs/reference/money.zero/)
