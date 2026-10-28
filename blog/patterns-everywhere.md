---
title: One pattern language for everything
date: 2025-02-02
summary: match, let, for and routes all take apart values. If they share one pattern language, learning one teaches all four.
tags: design, language
---
Languages tend to grow several small ways of taking a value apart. Destructuring in `let`, cases in a `switch`, arguments in a function, and on the web, the router's own little syntax for paths and the validator's for bodies. Each has slightly different rules.

The plan for Quillo is to have one, and use it everywhere a value is taken apart.

### The same pattern, four places

```quillo
match event {
    { type: "order", id: int as id } => ship(id)
    { type: "refund" | "chargeback", amount } => refund(amount)
    _ => null
}

let [first, second, ..rest] = scores
for [key, value] in settings => `${key}=${value}`

route POST /orders { json: { items: [_, ..], coupon: str = "" } } = create(json)
```

The route's body pattern is the `match` pattern: a map with `items` that has at least one element, and a `coupon` that defaults to empty. A request that does not fit is not this route, exactly as a value that does not fit is not this arm.

### What patterns can say

- **Literals and alternatives:** `"order" | "refund"`.
- **Types:** `int`, `str`, `list`, and `int as n` to name what matched.
- **Lists:** `[a, b, ..rest]`.
- **Maps:** `{ name, limit: int = 20 }`, with defaults for missing fields.

Small enough to fit on a card, and enough for most of what a web program receives.

### Why it matters on the web

Most bugs at the edge of a service are about shape: a field missing, a number sent as text, a list that should not be empty. When the language's own patterns describe the shape, the route list documents every endpoint's input, and the checker can read it.

> **Since then:** patterns work the same in `match`, `let`, `for` and route declarations. See [Patterns](/docs/language-tour/#patterns).
