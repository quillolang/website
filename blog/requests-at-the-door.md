---
title: Checking requests at the door
date: 2024-06-21
summary: Validation usually happens inside the handler, after the request is already in. A pattern in the route can turn a bad request away before any code runs.
tags: design, routes, validation
---
Every handler starts the same way: read the body, check each field, turn strings into numbers, answer 400 when something is off. Then the real work. The checking is the same in every handler and different in each, and it is where most bugs on the edge of a service live.

The idea here is to move it into the route, where it can be read at a glance.

### A pattern is the contract

```quillo
type Signup = { email: str, name: str, plan: "free" | "pro" = "free" }

route POST /signup { json: Signup } = create_account(json)
route POST /signup = respond(422, "send an email and a name")
```

The first route only matches when the body is a `Signup`: an object with a string `email` and `name`, and a `plan` that is one of two words, or missing, then `"free"`. Inside it, `json` is already checked and filled in. When the body does not fit, the next route answers.

Queries work the same way, and numbers in them become numbers:

```quillo
route GET /search { query: { q: str, page: int = 1 } } = search(q, page)
```

### Why patterns and not a schema library

A schema library is a second language for data, with its own errors, and the handler still has to call it. Patterns are the ones the language already has for `match` and `let`, so a request is matched the way any value is. Fewer things to learn, and nothing to forget to call.

It also makes the route list honest: it says what each endpoint takes, in the same place as the path.

> **Since then:** request patterns, records and their defaults are how Quillo routes take input. See [Validation](/docs/validation/) and [Records](/docs/language-tour/#records).
