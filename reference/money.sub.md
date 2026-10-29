# money.sub
money.sub(map, map) -> map
group: Decimals and money

### What it does

The first amount less the second, as money of their currency. Both must be of one
currency: subtracting across currencies is a runtime error. The difference is exact
and keeps the currency's decimals; it is negative when the second amount is larger.

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
- Either map may be made by hand or come from JSON (an amount that is a decimal, an
  int or numeric text; any case of the code). An amount with more decimals than the
  currency has is allowed in, and the difference is rounded half to even.
- The result carries the first amount's code, in upper case.

```quillo
print(money.sub(money.of("0.1", "USD"), money.of("0.3", "USD")))
print(money.sub({ amount: "5", currency: "usd" }, { amount: "1.005", currency: "USD" }))
```

```output
{ amount: -0.20m, currency: "USD" }
{ amount: 4.00m, currency: "USD" }
```

### Errors

Two currencies, or a value that is not money, are runtime errors that stop the
request, not error values.

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
