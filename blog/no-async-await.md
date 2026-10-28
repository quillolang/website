---
title: No async, no await
date: 2025-05-31
summary: Async functions spread through a codebase like a dye. A web language can wait where it must and keep every function looking the same.
tags: design, language, concurrency
---
Add one call to the network deep inside a program, and in many languages every function above it has to change: `async` on each, `await` at each call, and a new way to fail when one is forgotten. The code that waits looks different from the code that does not, though to the person reading it they do the same thing.

Most of what a web program does is wait: for the database, another service, a file. So the plan is to make waiting invisible.

### On the server

```quillo
route GET /dashboard {
    let user = load_user(session().user)
    let orders = db.query("select * from orders where user_id = ?", user.id)
    <Dashboard user={user} orders={orders}/>
}
```

Each call simply waits. Meanwhile, other requests run: the runtime takes the next one while this one is held up, so a slow query holds up only the page that asked for it.

### In the browser

```quillo
component Notes(initial: list) {
    state notes = initial
    <button @click={() => { notes = load_more(len(notes)) }}>More</button>
}
```

`load_more` is a server function. In the browser the call is a request, and the compiler awaits it, and every function that calls it. Nothing in the code says so, because nothing needs to.

### When you want things at once

Waiting one after another is the safe default. When two calls do not depend on each other, say so:

```quillo
let [user, orders] = parallel(() => load_user(id), () => load_orders(id))
```

On the server the two waits overlap. In the browser it is `Promise.all`. One word, where it matters, instead of two on every line.

> **Since then:** Quillo has no `async` or `await`; calls wait, and `parallel` overlaps them. See [Async](/docs/async/).
