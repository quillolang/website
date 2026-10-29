# money.compare
money.compare(map, map) -> int
group: Decimals and money

### What it does

How two amounts of one currency stand: `-1` when the first is smaller, `0` when they
are equal, `1` when it is larger. Comparing across currencies is a runtime error, as
is adding them. Use it where `<` and `>` would be used on numbers: is the balance
enough, is the total over the limit.

### Examples

```quillo
let a = money.of("10.25", "USD")
let b = money.of("0.75", "USD")
print(money.compare(a, b), money.compare(b, a), money.compare(a, a))
print(money.compare(a, b) > 0, money.compare(money.of(-1, "USD"), money.zero("USD")))
```

```output
1 -1 0
true -1
```

### Edge cases

- Zeros at the end do not count: `10.25` and `10.250` compare equal.
- A map made by hand or read from JSON compares too, its amount an int or numeric
  text, its code in any case.
- For a sort, `sort_by` on the `amount` is simpler; `money.compare` is for one
  decision.

```quillo
let a = money.of("10.25", "USD")
print(money.compare(a, { amount: "10.250", currency: "usd" }))
let enough = money.compare(money.of(50, "USD"), a) >= 0
print(enough)
print([money.of(3, "USD"), money.of(1, "USD"), money.of(2, "USD")] | sort_by((m) => m.amount) | map((m) => m.amount))
```

```output
0
true
[1.00m, 2.00m, 3.00m]
```

### Errors

Two currencies, or a value that is not money, are runtime errors, not error values.

```quillo error
print(money.compare(money.of(1, "USD"), money.of(1, "EUR")))
```

```output
line 1: cannot compare USD and EUR: convert one currency to the other first
```

### Chaining

```quillo
let limit = money.of(100, "USD")
print(money.of(120, "USD") | money.compare(limit))
print([money.of(120, "USD"), money.of(80, "USD")] | filter((m) => money.compare(m, limit) > 0) | len)
```

```output
1
1
```

### See also

[money.is_zero](/docs/reference/money.is_zero/), [money.sub](/docs/reference/money.sub/), [money.add](/docs/reference/money.add/), [sort_by](/docs/reference/sort_by/)
