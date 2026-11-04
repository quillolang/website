# money.add
money.add(map, map) -> map | error(str)
group: Decimals and money

### What it does

The sum of two amounts of one currency, as money of that currency. Adding two
currencies is a runtime error, never a sum: convert one to the other with a rate the
program chose first. The sum is exact and keeps the currency's decimals. A sum too
large to count in minor units (past `92233720368547758.07` dollars) is an error value.
`a + b` on two money values adds them the same way, but there two currencies give an
error value, not a runtime error.

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

- Either map may be made by hand or come from JSON, and is read as `money.of` reads an
  amount: a decimal, an int or numeric text without an exponent, and a code trimmed and
  in any case. An amount with more decimals than the currency has is a runtime error:
  round it first with `money.round`.
- The result carries the first amount's currency code, in upper case, and nothing else
  that was in the maps.
- A sum past what `money.of` takes is an error value, so `??` can catch it.
- `+` and `+=` add two money values as `money.add` does. Only maps of exactly `amount`
  and `currency` are money there: other maps still merge.

```quillo
let m = json.parse(`{ "amount": "12.50", "currency": "usd" }`)
print(money.add(m, money.of(1, "USD")))
print(money.add({ amount: 1, currency: " usd ", note: "x" }, money.of(1, "USD")))
let max = money.of("92233720368547758.07", "USD")
print(money.add(max, money.of("0.01", "USD")))
let a = money.of("10.25", "USD")
print(a + money.of("0.75", "USD"), a + money.of(1, "EUR"))
```

```output
{ amount: 13.50m, currency: "USD" }
{ amount: 2.00m, currency: "USD" }
err("92233720368547758.08 USD is too large an amount")
{ amount: 11.00m, currency: "USD" } err("cannot add USD and EUR: convert one currency to the other first")
```

### Errors

Two currencies, or a value that is not money (a number, `null`, a map without a
known `currency`, with a float amount or with more decimals than its currency has), are
runtime errors that stop the request, not error values. Only a sum too large is an
error value.

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

```quillo error
print(money.add({ amount: "1.005", currency: "USD" }, money.of(1, "USD")))
```

```output
line 1: `money.add`: 1.005 has more decimals than USD has (2): round it first with money.round(m, mode)
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
