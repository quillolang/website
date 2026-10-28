---
title: Small syntax decisions
date: 2025-11-16
summary: A language is mostly small choices. A few from the prototype: what braces mean, where a line ends, and why `for` cannot name a label.
tags: design, language
---
The big ideas get the posts. A language's daily feel comes from small decisions, made once and lived with forever. Here are some, and why they went the way they did.

### `{ x }` is a block, `{ x: 1 }` is a map

```quillo
let point = (x: int, y: int = 0) => { x, y }   // a map: two fields
let same = (x) => { x }                         // a block: it returns x
```

Braces mean both a block and a map, as in JavaScript. The rule: one bare name is a block, anything with a comma or a colon is a map. It is the reading most people guess, and the checker warns when it may not be.

### Lines that continue

```quillo
let paid = orders
    | filter((o) => o.paid)
    | map((o) => o.total)
```

A line that starts with `|`, `??`, `&&`, `||`, `?`, `:`, `.method` or `else` carries on the line before. No semicolons, and no trailing operators to remember.

### `for` is a keyword, so labels use `field`

`for` loops over lists in code and in markup, so `<label for="email">` cannot use it. In views a label's target is `field`:

```quillo
<label field="email">Email</label>
```

An odd word to learn once, rather than a keyword that means two things.

### Names are free, until they hide a builtin

A variable may be called `max`, but then `max(...)` means the variable in that scope. The checker says so where it happens, because a prop named `max` quietly breaking a call three lines down is the kind of bug nobody finds by reading.

> **Since then:** these rules are in Quillo's language tour. See [Language tour](/docs/language-tour/).
