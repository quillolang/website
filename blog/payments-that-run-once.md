---
title: Payments that run once
date: 2026-02-18
summary: A client that sent a payment and got no answer cannot tell whether it went through. Idempotency keys let it ask again safely; idempotent() makes them one line.
tags: features, payments
---
A phone sends a payment, the network drops, and no answer comes back. Did the payment happen? The client cannot know. If it sends again and the first one went through, the customer pays twice. If it does not and the first one failed, they do not pay at all.

Stripe's answer, now an IETF draft, is the idempotency key: the client makes up a key for the request and sends the same key when it retries. The server runs the request once, and answers a retry with the first answer.

### One wrapper

```quillo
route POST /payments { json: { to: str, amount: dec } } = idempotent(() => {
    let id = pay(to, amount)?
    respond(201, { id })
})
```

```sh
curl localhost:8080/payments -H "Idempotency-Key: $(uuidgen)" --json '{"to": "bob", "amount": "12.50"}'
```

`idempotent(f)` keeps the first answer for each key: the status, the headers and the body. The same request again with the same key gets that answer back, marked `Idempotent-Replayed: true`, and `f` does not run.

### The edge cases, handled

- **The same key with a different request** (another amount) is refused with 422. That is a client bug, not a retry.
- **A retry while the first is still running** gets 409, to be sent again a moment later. Neither runs twice.
- **Keys belong to a user**, so one customer's key cannot replay another's answer.
- **Server functions too:** `idempotent({ isolation: "serializable", retries: 5 }, () => move(from, to, amount))` for a transfer between accounts.

Getting this right by hand takes a table, a lock and careful thought about every failure. It is the kind of thing a web language should do once, correctly.

> **Read more:** [Idempotent requests](/docs/routes/#idempotent-requests) in the docs.
