# money.allocate
money.allocate(map, list | int) -> list
group: Decimals and money

### What it does

An amount split into shares by ratios, without losing or making a minor unit: a list
of money, one per ratio, that adds up to the amount exactly. The ratios are ints or
decimals; a number `n` means `n` equal parts. Each share gets its part rounded down,
and the minor units left over go one each to the shares closest to their next unit,
the largest remainders, a tie to the first. It is how to split a bill, a payment
across instalments or a budget across departments.

### Examples

```quillo
let total = money.of(100, "USD")
print(money.allocate(total, [1, 1, 1]))
print(money.allocate(total, 3) | map((s) => s.amount))
print(money.allocate(total, [70, 30]) | map((s) => s.amount), money.allocate(total, [1, 2, 3]) | map((s) => s.amount))
```

```output
[{ amount: 33.34m, currency: "USD" }, { amount: 33.33m, currency: "USD" }, { amount: 33.33m, currency: "USD" }]
[33.34m, 33.33m, 33.33m]
[70.00m, 30.00m] [16.67m, 33.33m, 50.00m]
```

### Edge cases

- Ratios may be decimals: `[0.7, 0.3]` as decimals splits as `[70, 30]` does.
- Too few units to go round: `0.05` in three is `0.02, 0.02, 0.01` (equal remainders,
  so the first shares), and `0.01` by `[3, 1]` is `0.01, 0.00`.
- A leftover unit goes to the share with the largest remainder, not to the first: `0.10`
  by `[1, 99]` is `0.00, 0.10`, since the 1% share's part is a tenth of a cent and the
  other's 9.9 cents. `1.00` by `[0, 0.5, 1]` is `0.00, 0.33, 0.67`.
- A ratio of 0 gets `0.00` and no remainder.
- A negative amount splits as the positive one does, each share negative.
- The amount is read as `money.of` reads one: a map made by hand with more decimals than
  its currency has is a runtime error.
- A currency with no minor units splits into whole units; one with three into
  thousandths.
- The shares always add up to the amount.

```quillo
let total = money.of(100, "USD")
print(money.allocate(total, [dec("0.7"), dec("0.3")]) | map((s) => s.amount))
print(money.allocate(money.of("0.05", "USD"), 3) | map((s) => s.amount), money.allocate(money.of("0.01", "USD"), [3, 1]) | map((s) => s.amount))
print(money.allocate(money.of("0.10", "USD"), [1, 99]) | map((s) => s.amount), money.allocate(money.of(1, "USD"), [0, dec("0.5"), 1]) | map((s) => s.amount))
print(money.allocate(total, [1, 0, 1]) | map((s) => s.amount), money.allocate(money.of(-100, "USD"), 3) | map((s) => s.amount))
print(money.allocate(money.of(1000, "JPY"), 3) | map((s) => s.amount), money.allocate(money.of(1, "KWD"), 3) | map((s) => s.amount))
print(money.allocate(total, [1, 1, 1]) | map(money.to_minor) | sum)
```

```output
[70.00m, 30.00m]
[0.02m, 0.02m, 0.01m] [0.01m, 0.00m]
[0.00m, 0.10m] [0.00m, 0.33m, 0.67m]
[50.00m, 0.00m, 50.00m] [-33.34m, -33.33m, -33.33m]
[334m, 333m, 333m] [0.334m, 0.333m, 0.333m]
10000
```

### Errors

Ratios that cannot split anything are runtime errors, not error values: no ratios
(`0` parts or an empty list), ratios that add up to 0, a negative ratio, a float
ratio, or more than 100,000 parts. A first argument that is not money is a runtime
error too.

```quillo error
print(money.allocate(money.of(1, "USD"), [0, 0]))
```

```output
line 1: `money.allocate`: the ratios must add up to more than 0
```

```quillo error
print(money.allocate(money.of(1, "USD"), [0.5, 0.5]))
```

```output
line 1: `money.allocate`: ratio 0 must be an int or a dec, 0 or more, got float 0.5
```

### Chaining

The amount comes first in a pipeline; the shares go on to `map`:

```quillo
print(money.of("99.99", "USD") | money.allocate(4) | map(money.format))
let people = ["ann", "bob", "cy"]
print(money.of(10, "USD") | money.allocate(len(people)) | zip(people) | map((pair) => `${pair[1]}: ${pair[0].amount}`))
```

```output
["$25.00", "$25.00", "$25.00", "$24.99"]
["ann: 3.34", "bob: 3.33", "cy: 3.33"]
```

### See also

[money.mul](/docs/reference/money.mul/), [money.to_minor](/docs/reference/money.to_minor/), [money.add](/docs/reference/money.add/), [money.format](/docs/reference/money.format/)
