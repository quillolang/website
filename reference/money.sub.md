# money.sub
money.sub(map, map) -> map | error(str)
group: Decimals and money

### What it does

The first amount less the second, as money of their currency. Both must be of one
currency: subtracting across currencies is a runtime error. The difference is exact
and keeps the currency's decimals; it is negative when the second amount is larger. A
difference too large to count in minor units is an error value. `a - b` on two money
values subtracts them the same way, but there two currencies give an error value, not
a runtime error.

### Examples

```quillo
let a = money.of("10.25", "USD")
let b = money.of("0.75", "USD")
print(money.sub(a, b), money.sub(b, a))
print(money.sub(a, a), money.is_zero(money.sub(a, a)))
```

```output
{ amount: 9.50m, currency: "USD" } { amount: -9.50m, currency: "USD" }
{ amount: 0.00m, currency: "USD" } true
```

### Edge cases

- Decimals are exact: `0.1 - 0.3` is exactly `-0.20`, where floats would give
  `-0.19999999999999998`.
- Either map may be made by hand or come from JSON, read as `money.of` reads an
  amount: a decimal, an int or numeric text without an exponent, and a code trimmed and
  in any case. An amount with more decimals than the currency has is a runtime error:
  round it first with `money.round`.
- The result carries the first amount's code, in upper case.
- A difference past what `money.of` takes, such as the largest amount less a negative
  one, is an error value.
- `-` and `-=` subtract two money values as `money.sub` does.

```quillo
print(money.sub(money.of("0.1", "USD"), money.of("0.3", "USD")))
print(money.sub({ amount: "5", currency: "usd" }, { amount: "1.25", currency: "USD" }))
print(money.sub(money.of("92233720368547758.07", "USD"), money.of("-1", "USD")))
let a = money.of("10.25", "USD")
print(a - money.of("0.25", "USD"), a - money.of(1, "EUR"))
```

```output
{ amount: -0.20m, currency: "USD" }
{ amount: 3.75m, currency: "USD" }
err("92233720368547759.07 USD is too large an amount")
{ amount: 10.00m, currency: "USD" } err("cannot subtract USD and EUR: convert one currency to the other first")
```

### Errors

Two currencies, or a value that is not money (with more decimals than its currency
has, too), are runtime errors that stop the request, not error values. Only a
difference too large is an error value.

```quillo error
print(money.sub(money.of(1, "USD"), money.of(1, "EUR")))
```

```output
line 1: cannot subtract USD and EUR: convert one currency to the other first
```

```quillo error
print(money.sub(money.of(1, "USD"), 1))
```

```output
line 1: `money.sub` expects money ({ amount, currency }) as argument 2, got int 1
```

```quillo error
print(money.sub({ amount: "5", currency: "USD" }, { amount: "1.005", currency: "USD" }))
```

```output
line 1: `money.sub`: 1.005 has more decimals than USD has (2): round it first with money.round(m, mode)
```

### Chaining

In a pipeline the amount on the left is the one subtracted from:

```quillo
let total = money.of(100, "USD")
print(total | money.sub(money.of("12.50", "USD")) | money.format)
let paid = [money.of(30, "USD"), money.of("20.50", "USD")]
print(paid | reduce(total, money.sub))
```

```output
$87.50
{ amount: 49.50m, currency: "USD" }
```

### See also

[money.add](/docs/reference/money.add/), [money.neg](/docs/reference/money.neg/), [money.mul](/docs/reference/money.mul/), [money.compare](/docs/reference/money.compare/), [money.is_zero](/docs/reference/money.is_zero/)
