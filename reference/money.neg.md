# money.neg
money.neg(map) -> map | error(str)
group: Decimals and money

### What it does

The amount with its sign flipped, in the same currency: a charge becomes a refund, a
debit a credit. Zero stays zero. The one amount whose negation does not fit in minor
units, the most negative, gives an error value.

### Examples

```quillo
let a = money.of("10.25", "USD")
print(money.neg(a))
print(money.neg(money.neg(a)), money.neg(money.of("-3", "EUR")))
```

```output
{ amount: -10.25m, currency: "USD" }
{ amount: 10.25m, currency: "USD" } { amount: 3.00m, currency: "EUR" }
```

### Edge cases

- Negating zero gives zero, not `-0.00`.
- The map may be made by hand, and is read as `money.of` reads an amount: an int or
  numeric text gets the currency's decimals (`"4.5"` gives `-4.50`), and the code comes
  back in upper case. More decimals than the currency has is a runtime error.
- Adding an amount and its negation is the currency's zero.
- The most negative amount, `-92233720368547758.08` dollars, has no positive in minor
  units: its negation is an error value.

```quillo
print(money.neg(money.zero("USD")), money.neg({ amount: "4.5", currency: "usd" }))
let a = money.of("10.25", "USD")
print(money.is_zero(money.add(a, money.neg(a))))
print(money.neg({ amount: "-92233720368547758.08", currency: "USD" }))
```

```output
{ amount: 0.00m, currency: "USD" } { amount: -4.50m, currency: "USD" }
true
err("92233720368547758.08 USD is too large an amount")
```

### Errors

A value that is not money, or a map with more decimals than its currency has, is a
runtime error, not an error value.

```quillo error
print(money.neg(5))
```

```output
line 1: `money.neg` expects money ({ amount, currency }) as argument 1, got int 5
```

```quillo error
print(money.neg({ amount: "4.505", currency: "USD" }))
```

```output
line 1: `money.neg`: 4.505 has more decimals than USD has (2): round it first with money.round(m, mode)
```

### Chaining

```quillo
print(money.of("12.50", "USD") | money.neg | money.format)
print([money.of(1, "USD"), money.of(2, "USD")] | map(money.neg) | map((m) => m.amount))
```

```output
-$12.50
[-1.00m, -2.00m]
```

### See also

[money.sub](/docs/reference/money.sub/), [money.add](/docs/reference/money.add/), [money.is_zero](/docs/reference/money.is_zero/), [money.compare](/docs/reference/money.compare/)
