# money.add
money.add(map, map) -> map
group: Decimals and money

### What it does

The sum of two amounts of one currency, as money of that currency. Adding two
currencies is a runtime error, never a sum: convert one to the other with a rate the
program chose first. The sum is exact and keeps the currency's decimals.

### Examples

```quillo
let a = money.of("10.25", "USD")
let b = money.of("0.75", "USD")
print(money.add(a, b))
print(money.add(a, money.zero("USD")), money.add(a, money.neg(a)))
```

```output
{ amount: 11.00m, currency: "USD" }
{ amount: 10.25m, currency: "USD" } { amount: 0.00m, currency: "USD" }
```

### Edge cases

- Either map may be made by hand or come from JSON: an amount that is a decimal, an
  int or numeric text counts, and the code's case does not matter.
- An amount with more decimals than the currency has is allowed in; the sum is rounded
  half to even to the currency's decimals.
- The result carries the first amount's currency code, in upper case, and nothing else
  that was in the maps.

```quillo
let m = json.parse(`{ "amount": "12.50", "currency": "usd" }`)
print(money.add(m, money.of(1, "USD")))
print(money.add({ amount: "1.005", currency: "USD" }, { amount: "1.015", currency: "USD" }))
print(money.add({ amount: 1, currency: "USD", note: "x" }, money.of(1, "USD")))
```

```output
{ amount: 13.50m, currency: "USD" }
{ amount: 2.02m, currency: "USD" }
{ amount: 2.00m, currency: "USD" }
```

### Errors

Two currencies, or a value that is not money (a number, `null`, a map without a
known `currency` or with a float amount), are runtime errors that stop the request,
not error values.

```quillo error
print(money.add(money.of(1, "USD"), money.of(1, "EUR")))
```

```output
line 1: cannot add USD and EUR: convert one currency to the other first
```

```quillo error
print(money.add(money.of(1, "USD"), null))
```

```output
line 1: `money.add` expects money ({ amount, currency }) as argument 2, got null null
```

### Chaining

A list of amounts is summed by folding `money.add` from the currency's zero:

```quillo
let lines = [money.of("9.99", "USD"), money.of("20.01", "USD"), money.of("0.50", "USD")]
print(lines | reduce(money.zero("USD"), money.add))
print(money.of(5, "USD") | money.add(money.of("0.25", "USD")) | money.format)
```

```output
{ amount: 30.50m, currency: "USD" }
$5.25
```

### See also

[money.sub](/docs/reference/money.sub/), [money.mul](/docs/reference/money.mul/), [money.neg](/docs/reference/money.neg/), [money.zero](/docs/reference/money.zero/), [money.compare](/docs/reference/money.compare/), [reduce](/docs/reference/reduce/)
