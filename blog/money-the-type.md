---
title: Money, the type
date: 2026-09-28
summary: Exact decimals were the start. An amount also has a currency, minor units and rounding rules, and a split that must not lose a cent.
tags: features, money
---
Exact decimals fix `0.1 + 0.2`. They do not stop a program from adding dollars to euros, keeping 12.345 dollars, or splitting 100 dollars three ways into 99.99. Money needs more than a number.

### An amount and its currency

```quillo
let price = money.of(19.99m, "USD")             // { amount: 19.99m, currency: "USD" }
money.of(form.amount, "EUR") ?? reply 400       // text from a form; an error value if bad
money.of("12.345", "USD")                       // err: more decimals than USD has
money.add(a, b)                                  // an error if a and b differ in currency
money.format(price, "de-DE")                    // "19,99 $"
```

An amount always has its currency's minor units (ISO 4217: two for USD, none for JPY, three for BHD). It is a plain map, so it goes into JSON, the database and the browser as it is, and `money` checks it each time it gets one.

### Two currencies are never a sum

`add`, `sub` and `compare` take amounts of one currency. Mixing two is an error, never a silent total. Converting is something you do on purpose, with a rate you chose.

### Splitting without losing a cent

```quillo
money.allocate(money.of(100, "USD"), [1, 1, 1])  // 33.34, 33.33, 33.33
```

`allocate` splits by ratios and gives the leftover minor units, one each, to the first shares, so the parts always add up to the whole. Refunds per night, a bill split three ways, a fee shared between sellers.

### The same on both sides

`money` works in components too, with the same rules, so the total in the cart is the total on the invoice, to the cent.

> **Read more:** [Money](/docs/money/) in the docs.
