---
title: Reading code left to right
date: 2024-08-28
summary: Data moves through a web program in steps. A pipe operator lets the code read in the order the data moves, without a class for every step.
tags: design, language
---
Most of what a web program does is move data through steps: rows from a query, filtered, sorted, cut to a page, turned into markup. Written as nested calls, the last step comes first:

```js
render(take(sortBy(filter(rows, isPaid), byDate), 20))
```

Method chains fix the order, but only for the methods the type happens to have. Add your own step and you are back to wrapping.

### The pipe

```quillo
let page = orders
    | filter((o) => o.paid)
    | sort_by((o) => o.date)
    | take(20)
    | map((o) => <OrderRow order={o}/>)
```

`x | f(a)` is `f(x, a)`: the value on the left becomes the first argument. Any function works as a step, the builtins and your own alike, so there is nothing to extend and no wrapper type. A line that starts with `|` carries on the line before, so a pipeline reads as a list of steps.

### Small choices that follow

- **Functions take the data first.** `filter(xs, f)`, not `filter(f, xs)`, so they pipe without a placeholder.
- **Missing is `null`, not an exception.** `find` gives `null` when nothing matches, and `??` gives a fallback: `find(users, (u) => u.id == id) ?? reply 404 "no such user"`.
- **Method calls still work** for those who think in them: `orders.filter(...)` is the same call.

None of this is new. Elixir and F# have pipes, and shells have had them for fifty years. The point is that a web language should have one from the start, because web code is mostly this.

> **Since then:** pipelines and the standard library built for them are in every Quillo program. See [Pipelines and method calls](/docs/language-tour/#pipelines-and-method-calls).
