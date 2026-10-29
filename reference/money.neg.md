# money.neg
money.neg(map) -> map
group: Decimals and money

### What it does

The amount with its sign flipped, in the same currency: a charge becomes a refund, a
debit a credit. Zero stays zero.

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
- The map may be made by hand: an amount that is an int or numeric text is negated as
  it is, its digits kept (`"4.5"` gives `-4.5`, not `-4.50`), and the code comes back
  in upper case.
- Adding an amount and its negation is the currency's zero.

```quillo
print(money.neg(money.zero("USD")), money.neg({ amount: "4.5", currency: "usd" }))
let a = money.of("10.25", "USD")
print(money.is_zero(money.add(a, money.neg(a))))
```

```output
{ amount: 0.00m, currency: "USD" } { amount: -4.5m, currency: "USD" }
true
```

### Errors

A value that is not money is a runtime error, not an error value.

```quillo error
print(money.neg(5))
```

```output
line 1: `money.neg` expects money ({ amount, currency }) as argument 1, got int 5
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
