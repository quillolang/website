# money.to_minor
money.to_minor(map) -> int
group: Decimals and money

### What it does

The amount as an int of its currency's minor units: cents for USD, yen for JPY, fils
for KWD. That int is what to keep in an integer column (`amount_cents integer`) when the
database has no exact decimals, and what to send to a payment API that counts in cents.
[money.from_minor](/docs/reference/money.from_minor/) turns it back.

### Examples

```quillo
print(money.to_minor(money.of("12.50", "USD")))
print(money.to_minor(money.of(1250, "JPY")), money.to_minor(money.of("1.234", "KWD")))
print(money.to_minor(money.of("-0.01", "USD")))
```

```output
1250
1250 1234
-1
```

### Edge cases

- The map need not come from `money.of`: any `{ amount, currency }` whose amount is a
  decimal, an int or numeric text (as JSON brings it) is money, read as `money.of` reads
  an amount: the code trimmed and in any case, text without an exponent.
- An amount made by hand with more decimals than the currency has is a runtime error,
  not rounded: `2.125` dollars is not a count of cents. Round it first with
  `money.round`, which says how: `2.125` half to even is 212 cents, `2.135` is 214.
- Keys beyond `amount` and `currency` are ignored.

```quillo
print(money.to_minor({ amount: dec("1.5"), currency: "USD" }), money.to_minor({ amount: 3, currency: " usd " }))
print(money.to_minor(money.round({ amount: "2.125", currency: "USD" })), money.to_minor(money.round({ amount: "2.135", currency: "USD" })))
let m = json.parse(`{ "amount": "12.50", "currency": "USD", "note": "x" }`)
print(money.to_minor(m))
```

```output
150 300
212 214
1250
```

### Errors

A value that is not money is a runtime error, not an error value: no `currency`, an
unknown one, an amount that is a float, or no map at all. The message says what was
given and why it is not money. An amount with more decimals than the currency has, or
whose minor units do not fit an int, is a runtime error too, and the message names the
amount; `money.of` refuses such an amount earlier, as an error value, so it arises only
from a map made by hand.

```quillo error
print(money.to_minor({ amount: 1.5, currency: "USD" }))
```

```output
line 1: `money.to_minor` expects money ({ amount, currency }) as argument 1, got map { amount: 1.5, currency: "USD" }: its amount is a float: make it with money.of(dec(x), currency)
```

```quillo error
print(money.to_minor({ amount: dec("99999999999999999999"), currency: "USD" }))
```

```output
line 1: `money.to_minor`: 99999999999999999999 USD is too large an amount
```

```quillo error
print(money.to_minor({ amount: "2.125", currency: "USD" }))
```

```output
line 1: `money.to_minor`: 2.125 has more decimals than USD has (2): round it first with money.round(m, mode)
```

### Chaining

The amount comes first in a pipeline, so `money.to_minor` closes one:

```quillo
print("19.99" | money.of("USD") | money.to_minor)
print(money.allocate(money.of(100, "USD"), 3) | map(money.to_minor))
print(money.allocate(money.of(100, "USD"), 3) | map(money.to_minor) | sum)
```

```output
1999
[3334, 3333, 3333]
10000
```

### See also

[money.from_minor](/docs/reference/money.from_minor/), [money.of](/docs/reference/money.of/), [money.minor_units](/docs/reference/money.minor_units/), [money.round](/docs/reference/money.round/), [int](/docs/reference/int/)
