# idempotent
idempotent(map | fn, fn=) -> any
group: Requests and pages

### What it does

Runs the function once for a request, however many times the request is sent. A
request with an `Idempotency-Key` header runs it and keeps the answer; the same
request again with the same key gets that answer back, with `Idempotent-Replayed:
true`, without running again. A client that sent a payment and got no answer can then
send it again safely. The function runs in a transaction on the program's database,
and its answer is written in that transaction, so the work and its answer are kept
together or not at all. The options come first: `max_age` (how long answers are kept,
24 hours unless given, up to 366 days), `user`, `required`, `transaction`,
`isolation` and `retries`. See [Idempotent requests](/docs/routes/#idempotent-requests).

### Examples

```quillo noexec
route POST /payments { json: { to: str, amount: dec } } = idempotent(() => {
    let id = pay(to, amount)?
    respond(201, { id })
})

server fn transfer(from: str, to: str, amount: str) =
    idempotent({ isolation: "serializable", retries: 5 }, () => move(from, to, amount))
```

The client sends the key with the request, and again with the retry:

```sh
curl localhost:8080/payments -H "Idempotency-Key: $(uuidgen)" --json '{"to": "bob", "amount": "12.50"}'
```

Outside a request, and in a request without the header, the function simply runs and
its value is the result:

```quillo
print(idempotent(() => 42))
print(idempotent({ max_age: "7d" }, () => "paid"))
```

```output
42
paid
```

### Edge cases

- `idempotent` answers the request with what the function gives, as the route or
  server fn would have: make it the last thing. What runs before it (a pattern, an
  `auth.required`) runs every time and is not kept.
- A key is 1 to 255 visible characters, else 400. The same key with another method,
  path, query or body is refused with 422; one that comes while the first is still
  running gets 409 (on SQLite, it waits for the first and gets its answer).
- Keys belong to the tenant, the mount point and the user (`session().user`, or the
  `user` option). The same key from another user is another request.
- When the function fails, returns an error value or replies early, the transaction
  rolls back and the answer is sent but not kept, so a retry runs again. To keep a
  refusal, return it: `respond(422, { error })` commits and is kept.
- A streamed answer (`stream`, `events`) cannot be kept. `Set-Cookie` headers are not
  kept either.
- `{ required: true }` answers 400 to a request without the header. `{ transaction:
  false }` runs the function without a transaction and keeps every answer, failures
  too, for work that is mostly outside the database (a call to a payment provider).
- Without a request the options are still checked, and the function still runs:

```quillo
print(idempotent({ transaction: false }, () => "no transaction"))
print(idempotent({ required: true, max_age: 3600 }, () => "runs outside a request"))
print(is_err(idempotent(() => err("not enough money"))))
```

```output
no transaction
runs outside a request
true
```

### Errors

An unknown option, a `max_age` that is not seconds or a duration, `transaction` that
is not a boolean, `retries` or `isolation` together with `transaction: false`, and a
call without a function (or with the function before the options) are runtime errors.
Calling it inside `db.transaction` is a runtime error too: it begins a transaction of
its own. A database that cannot be reached when the key is recorded answers the
request 503.

```quillo error
print(idempotent({ nope: 1 }, () => 1))
```

```output
line 1: `idempotent` has no option `nope` (max_age, user, required, transaction, isolation, retries)
```

```quillo error
print(idempotent(() => 1, { max_age: "7d" }))
```

```output
line 1: `idempotent` expects a function, like idempotent(() => pay(order)), with options before it if any
```

### Chaining

`idempotent` wraps the whole of a route's work; the pipeline goes inside the function,
and the value the function ends with is what the client gets, now and on a retry:

```quillo noexec
route POST /orders { json: { items: list } } = idempotent(() =>
    items | map(reserve) | place_order | (id) => respond(201, { id }))
```

### See also

[db.transaction](/docs/reference/db.transaction/), [respond](/docs/reference/respond/), [session](/docs/reference/session/), [tenant](/docs/reference/tenant/)
