# money.is_zero
money.is_zero(map) -> bool
group: Decimals and money

### What it does

Whether an amount is nothing: `true` for zero in any currency, `false` for any other
amount, positive or negative. It asks the amount's value, not its digits, so `0`,
`0.00` and `-0.00` are all zero.

### Examples

```quillo
print(money.is_zero(money.zero("USD")), money.is_zero(money.of("0.01", "USD")))
let a = money.of("10.25", "USD")
print(money.is_zero(money.sub(a, a)), money.is_zero(money.neg(a)))
```

```output
true false
true false
```

### Edge cases

- A map made by hand counts: an amount of `"0.000"`, `0` or `"-0.00"` is zero.
- A product that rounds to nothing is zero: `0.01 × 0.5` half to even is `0.00`.

```quillo
print(money.is_zero({ amount: "0.000", currency: "USD" }), money.is_zero({ amount: 0, currency: "JPY" }), money.is_zero(money.of("-0.00", "USD")))
print(money.is_zero(money.mul(money.of("0.01", "USD"), dec("0.5"))))
```

```output
true true true
true
```

### Errors

A value that is not money is a runtime error, not an error value: `money.is_zero(0)`
stops the request, since `0` is a number, not an amount.

```quillo error
print(money.is_zero(0))
```

```output
line 1: `money.is_zero` expects money ({ amount, currency }) as argument 1, got int 0
```

### Chaining

```quillo
let paid = [money.of(0, "USD"), money.of("2.50", "USD"), money.zero("USD")]
print(paid | filter(money.is_zero) | len)
print(money.of(5, "USD") | money.sub(money.of(5, "USD")) | money.is_zero)
```

```output
2
true
```

### See also

[money.zero](/docs/reference/money.zero/), [money.compare](/docs/reference/money.compare/), [money.sub](/docs/reference/money.sub/), [money.neg](/docs/reference/money.neg/)
