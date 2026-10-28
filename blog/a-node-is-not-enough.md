---
title: A node is not enough
date: 2026-04-22
summary: One process on one core is where most web servers start, and where busy ones run out of room. Quillo spreads the same program over every core, then over several servers, without a broker in between.
tags: performance, architecture, scaling
---
A single web process runs its code on one thread. That is a fine design for a server that mostly waits, and it is how Node.js made servers simple: while one request waits for the database, another runs. But a busy server does not only wait. It renders pages, checks input, sorts results, and all of that happens one request at a time, on one core, while the machine's other cores idle.

The usual answer is more processes: a cluster module, a process manager, a load balancer in front. Then the processes need to share sessions, and pages that update live need a broker so a change made through one process reaches pages connected to another. One node becomes a small distributed system.

### Waiting is free

A Quillo program's calls simply wait. Many requests can be waiting at once (`--workers`, 64 by default), each for its database or network, while others run. A slow query holds up only the page that asked for it.

### Every core

```sh
quillo run app.qwe --instances 8
```

`--instances` runs the program eight times over, one event loop each, on a core of its own. Each instance has its own variables, as eight processes would, and they share what should be shared: the port, the database, and changes announced with `publish`, so a page connected to one instance hears about a write made through another.

### More than one machine

When one machine is not enough, servers join a pool behind [limer](https://limer.sh):

```sh
quillo run shop.qwe --port 8081 --register http://10.0.0.1:2019
```

Each server registers with the balancer, and with a `broadcast` path in the pool, a change made through one server wakes live pages on all of them. Sessions work on every server as long as they share `QUILLO_SECRET`. No message broker is involved.

### And past that

Not every part of an app needs more of the same. A heavy part can become a service of its own, on its own machines, called from the rest with the same code, as [an earlier post](/blog/one-app-many-servers/) describes.

One node is where a Quillo program starts. It is not where it has to stay.

> **Read more:** [Concurrency and reloading](/docs/concurrency-and-reloading/) and [Live data across servers](/docs/components/#several-servers) in the docs.
