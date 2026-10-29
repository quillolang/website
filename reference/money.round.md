# money.round
money.round(map, str=) -> map
group: Decimals and money

### What it does

The amount rounded to its currency's decimals, half to even unless a rounding mode
(those of [round](/docs/reference/round/)) says otherwise. Money from `money.of` and
the `money` arithmetic already has them; `money.round` is for a map made by hand, or
whose amount came from the program's own decimal arithmetic, such as a rate applied
with `*`.

### Examples

```quillo
let m = { amount: dec("12.345"), currency: "USD" }
print(money.round(m), money.round(m, "half_up"))
print(money.round({ amount: dec("19.99") * dec("1.21"), currency: "EUR" }))
```

```output
{ amount: 12.34m, currency: "USD" } { amount: 12.35m, currency: "USD" }
{ amount: 24.19m, currency: "EUR" }
```

### Edge cases

- The modes are `half_even` (the default), `half_up`, `half_down`, `up` (away from
  zero), `down` (toward zero), `ceiling` and `floor`.
- Half to even goes to the even cent: `12.355` becomes `12.36`, and so does `12.365`.
- An amount that is an int or numeric text is read as a decimal first, and one with
  fewer decimals than the currency gets zeros: `7` dollars is `7.00`.
- An amount already at the currency's decimals comes back as it is.
- For a currency with no minor units the result is whole.

```quillo
print(money.round({ amount: "12.355", currency: "USD" }), money.round({ amount: "12.365", currency: "USD" }))
print(money.round({ amount: "12.341", currency: "USD" }, "up"), money.round({ amount: "-12.345", currency: "USD" }, "floor"))
print(money.round({ amount: 7, currency: "USD" }), money.round({ amount: "1.5", currency: "JPY" }, "ceiling"))
let a = money.of("10.25", "USD")
print(money.round(a) == a)
```

```output
{ amount: 12.36m, currency: "USD" } { amount: 12.36m, currency: "USD" }
{ amount: 12.35m, currency: "USD" } { amount: -12.35m, currency: "USD" }
{ amount: 7.00m, currency: "USD" } { amount: 2m, currency: "JPY" }
true
```

### Errors

A mode that is not one of the seven, or a value that is not money, is a runtime
error, not an error value.

```quillo error
print(money.round(money.of(1, "USD"), "nearest"))
```

```output
line 1: `money.round`: unknown rounding "nearest" (one of half_even, half_up, half_down, up, down, ceiling or floor)
```

```quillo error
print(money.round("12.345"))
```

```output
line 1: `money.round` expects money ({ amount, currency }) as argument 1, got str "12.345"
```

### Chaining

```quillo
let rate = dec("0.0825")
let price = money.of("49.99", "USD")
print({ amount: price.amount * rate, currency: "USD" } | money.round | money.format)
print({ amount: price.amount * rate, currency: "USD" } | money.round("up") | money.format)
```

```output
$4.12
$4.13
```

### See also

[money.of](/docs/reference/money.of/), [money.mul](/docs/reference/money.mul/), [money.to_minor](/docs/reference/money.to_minor/), [round](/docs/reference/round/), [dec](/docs/reference/dec/)
