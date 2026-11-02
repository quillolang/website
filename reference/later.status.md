# later.status
later.status(str) -> map | null
group: Database

### What it does

Says what became of a call made later, from the id `.later` gave:

- `{ state: "waiting", tries, error }`: not through yet, after `tries` tries.
- `{ state: "done", result }`: through. `result` is what the function gave, an error
  value if it said no. It is kept for a day.
- `{ state: "failed", error }`: given up on, and kept. See [Calls made later](/docs/microservices/#calls-made-later).
- `null`: nothing is known of it, as with a call finished over a day ago, one kept in
  memory and done, or one in a transaction that has not committed.

`error` is an error value, as it can name a service's address, so a visitor is not
shown it. It is read outside any transaction.

### Examples

```quillo
print(later.status("no such call"))
```

```output
null
```

A route that makes the call later and gives its id, a route that says how it went, and
the service whose `server fn` it calls:

```quillo noexec
// payments.qwe
server fn charge(ref: str) {
    if ref == "" { return err("no reference") }   // done, with an error value as its result
    { ref, paid: true }
}
```

```quillo noexec
// main.qwe
service payments = "payments.qwe"

route POST /charge = payments.later.charge(request.json.ref)

route GET /charge/:id {
    let s = later.status(id)
    if s == null {
        return respond(404, "no such charge")
    }
    if s.state == "done" && is_err(s.result) {
        return `refused: ${s.result.error}`
    }
    s.state
}
```

```sh
curl localhost:8080/charge --json '{"ref": "order-17"}'    # "a4a241a6cb58b5bd973075e6"
curl localhost:8080/charge/a4a241a6cb58b5bd973075e6        # waiting, then done
```
