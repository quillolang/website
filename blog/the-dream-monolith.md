---
title: The dream monolith with an escape hatch
date: 2026-10-28
summary: Build one program, deploy one binary, and when one part gets busy, give it copies of its own, without changing a line. The escape hatch is a flag, not a rewrite.
tags: services, architecture, design
---
Every team knows the trade. A monolith is fast to build, simple to deploy and easy to reason about, until one part of it needs ten times the capacity of the rest. Microservices let that part scale alone, and cost a network boundary in every call, a deployment per service, and a rewrite to get there.

The dream is a monolith you never have to rewrite: one program while it is small, and copies of its heavy part when it is not, with the same code throughout.

### One program

```quillo
// app.qwe
service /shop = "shop.qwe"
service /risk = "risk.qwe"

// shop.qwe
service risk = "risk.qwe"

route POST /checkout {
    let verdict = risk.assess(request.form.order)?
    verdict.ok ? <p>Thank you</p> : reply 402 "Payment refused"
}
```

`risk.assess` calls a `server fn` in `risk.qwe`. Run as one process, it is a function call.

### The escape hatch: a flag

```sh
quillo run app.qwe --split --scale risk=3
```

Now `risk` runs as three processes of its own, called in turn, and `shop.qwe` has not changed. The calls are signed, retried at the next copy when one does not answer, and run once: copies that share a database share the calls they have answered, so a retry never charges twice.

### Growing while it runs

```sh
quillo run risk.qwe --as-service --port 8081 --join http://app:8080
```

A copy started on another machine joins the running app. The app calls the joined copies first and falls back to its own. A monolith that takes on help as it gets busy, and lets it go when the copies stop, again without a line of either changed.

### Knowing it is ready

- **`GET /_quillo/ready`** answers 200 only when what the program needs is there: its database, each service down its chain, and checks of its own.
- **Contracts travel with calls.** A copy deployed with a different version of a function refuses the call and says how the two differ, instead of answering wrong.
- **`quillo docs`** writes the whole API as OpenAPI, routes and server functions alike, for a gateway to import.

The decision between monolith and services moves from the first week to whenever it is needed, and it is made with a flag.

> **Read more:** [Microservices](/docs/microservices/) in the docs.
