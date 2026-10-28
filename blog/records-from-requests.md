---
title: Types that a request can be made into
date: 2025-05-06
summary: A type in most web stacks is a promise about data that was never checked. A record that is checked at the door, with its defaults filled in, is a type you can trust.
tags: design, language, validation
---
In a typed web stack, the body of a request is usually cast to a type, not checked against it. The type says `age: number`, the client sends `"forty"`, and the program finds out three functions later. The type was a hope.

### A record is checked when it is made

```quillo
type Address = { city: str, zip: str? }
type User = {
    name: str,
    email: str,
    role: "admin" | "member" = "member",
    address: Address?,
    tags: list<str> = [],
}

let ada = User({ name: "Ada", email: "ada@example.com" })
// { name: "Ada", email: "ada@example.com", role: "member", tags: [] }
```

`User(...)` checks every field and fills in the defaults. A value that is not a `User` is an error, so a `User` you hold has been checked.

### And it is a pattern

```quillo
route POST /users { json: User } = save(json)
route POST /users = respond(422, "not a user")
```

The same type turns a request body into a checked value, at the route, before any code runs. Fields the type does not name are left out, so a client cannot slip `role: "admin"` into a value that never asked for it.

### Small on purpose

Records are maps with a name and a shape: no classes, no methods, no inheritance. They print as JSON, go into the database as they are and cross to the browser unchanged. The goal is a type that matches what a web program actually passes around.

> **Since then:** records, their defaults and request patterns made from them are part of Quillo. See [Records](/docs/language-tour/#records).
