---
title: One app, many servers, the same code
date: 2026-03-11
summary: Start as one program, and move the heavy part to servers of its own when it needs them, without rewriting the calls between them.
tags: features, services, architecture
---
Most apps start as a monolith because it is the fastest way to build. Some parts later need to scale apart, and the move to services means rewriting every call between them as HTTP: clients, retries, signatures, timeouts. The code that worked becomes code that talks about the network.

### A service is a program others call

```quillo
// shop.qwe
service billing = "billing.qwe"

route POST /buy {
    let inv = billing.invoice(request.form.name, 1200)?
    <p>Invoice #{inv.id}</p>
}
```

`billing.invoice` calls the `server fn invoice` in `billing.qwe`. Run together, in one process, the call goes straight to it, like any function call.

### Split it without changing it

```sh
quillo run app.qwe --service-url billing=http://10.0.0.5:8081
```

Now billing runs on a server of its own, and the same call goes over the network: signed with HMAC under a shared secret, carrying the time, the function, the arguments and an id. The code in `shop.qwe` does not change.

### What makes it safe to split

- **A call sent twice runs once.** A service remembers each call's id, so a retry, or someone replaying a call they saw, gets the first answer.
- **Copies share that memory** when they share a database, so a balancer can send a retry to any copy.
- **Failures are values.** A call that cannot reach the service returns an error value, so `?` and `??` handle it like any other failure.

The aim is that "monolith or services" stops being an architecture decision made on day one, and becomes a deployment flag changed on day three hundred.

> **Read more:** [Microservices](/docs/microservices/) in the docs.
