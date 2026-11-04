# money.mul
money.mul(map, dec | int, str=) -> map | error(str)
group: Decimals and money

### What it does

An amount times a factor, a decimal or an int, rounded to the currency's decimals:
half to even unless a rounding mode (those of [round](/docs/reference/round/)) says
otherwise. This is the place for a quantity, a VAT rate or a discount. A float factor
is a runtime error: make it a decimal with `dec` first, so the product is exact before
it is rounded. A product too large to count in minor units is an error value.

### Examples

```quillo
let price = money.of("10.25", "USD")
print(money.mul(price, 3))
print(money.mul(price, dec("0.075")), money.mul(price, dec("0.075"), "half_up"), money.mul(price, dec("0.075"), "down"))
print(money.mul(price, -1), money.mul(price, 0))
```

```output
{ amount: 30.75m, currency: "USD" }
{ amount: 0.77m, currency: "USD" } { amount: 0.77m, currency: "USD" } { amount: 0.76m, currency: "USD" }
{ amount: -10.25m, currency: "USD" } { amount: 0.00m, currency: "USD" }
```

### Edge cases

- The product is exact and rounded once: `10.25 × 0.075` is `0.76875`, so `0.77` half
  to even and `0.76` rounded down.
- A half rounds to the even cent by default: `0.01 × 0.5` is `0.00`, and `0.01` with
  `half_up`.
- A currency with no minor units rounds to a whole: `100 JPY × 0.5` is `50`; one with
  three keeps three.
- The modes are `half_even`, `half_up`, `half_down`, `up`, `down`, `ceiling` and
  `floor`; `null` as the mode means `half_even`.
- The amount is read as `money.of` reads one: a map made by hand with more decimals
  than its currency has is a runtime error, not rounded. The rounding is for the
  product only.
- A product past what `money.of` takes is an error value, so `??` can catch it.

```quillo
print(money.mul(money.of("0.01", "USD"), dec("0.5")), money.mul(money.of("0.01", "USD"), dec("0.5"), "half_up"))
print(money.mul(money.of(100, "JPY"), dec("0.5")), money.mul(money.of(1, "KWD"), dec("0.3333")))
print(money.mul(money.of("10.25", "USD"), dec("1.5"), null).amount)
print(money.mul(money.of("92233720368547758.07", "USD"), 2))
```

```output
{ amount: 0.00m, currency: "USD" } { amount: 0.01m, currency: "USD" }
{ amount: 50m, currency: "JPY" } { amount: 0.333m, currency: "KWD" }
15.38
err("184467440737095516.14 USD is too large an amount")
```

### Errors

A float factor, a factor that is text, a mode that is not one of the seven, or a first
argument that is not money (with more decimals than its currency has, too) are runtime
errors, not error values. Only a product too large is an error value.

```quillo error
print(money.mul(money.of(1, "USD"), 1.5))
```

```output
line 1: `money.mul` takes a dec or an int, not a float: convert it with dec(x)
```

```quillo error
print(money.mul(money.of(1, "USD"), 2, "nearest"))
```

```output
line 1: `money.mul`: unknown rounding "nearest" (one of half_even, half_up, half_down, up, down, ceiling or floor)
```

### Chaining

The amount comes first in a pipeline, so a line's total reads left to right:

```quillo
print(money.of("10.25", "USD") | money.mul(3) | money.format)
let lines = [{ price: money.of("2.50", "USD"), qty: 4 }, { price: money.of("0.99", "USD"), qty: 3 }]
print(lines | map((l) => money.mul(l.price, l.qty)) | reduce(money.zero("USD"), money.add))
```

```output
$30.75
{ amount: 12.97m, currency: "USD" }
```

### See also

[money.add](/docs/reference/money.add/), [money.round](/docs/reference/money.round/), [money.allocate](/docs/reference/money.allocate/), [dec](/docs/reference/dec/), [round](/docs/reference/round/)
