---
title: Money is not a float
date: 2025-07-13
summary: 0.1 + 0.2 is not 0.3 in most languages, and every shop finds out at checkout. A web language should have exact decimals built in, with a literal of their own.
tags: design, language, money
---
Every web developer learns this once, usually from an invoice: `0.1 + 0.2` is `0.30000000000000004`. Floats are binary fractions, and most decimal amounts have no exact binary form. The fixes are well known: count in cents, or pull in a decimal library and remember to use it everywhere. Both are easy to get wrong in one place.

### A decimal with its own literal

```quillo
let price = 19.99m
let total = price * 3 + 4.50m          // 64.47m
let vat = round(total * 0.21m, 2)      // 13.54m, rounded half to even
0.1m + 0.2m == 0.3m                    // true
```

The `m` suffix (borrowed from C#) makes a `dec`: an exact decimal of up to 28 digits. It keeps its digits, so `12.50m` shows as "12.50", and rounding is something you ask for, with the mode you want.

### Mixing is an error, not a guess

```quillo
1.5m + 0.5        // error: convert one with dec(x) or float(x)
```

A decimal and a float never quietly become a float. The moment exact money meets an inexact number, the program says so, which is the moment you want to know.

### From the outside

Amounts arrive as text, from forms and JSON. `dec("12.50")` reads them exactly, and bad text is an error value, so `dec(form.amount) ?? reply 400` is the whole check.

Exact decimals are a small feature. But a web language without them leaves every shop to rebuild them, and some will not.

> **Since then:** decimals with the `m` literal, and a `money` type built on them, are in Quillo. See [Money](/docs/money/).
