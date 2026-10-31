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

```quillo noexec
service payments = "payments.qwe"

route POST /charge = payments.later.charge(request.json.ref)

route GET /charge/:id {
    let s = later.status(id)
    if s == null {
        return respond(404, "no such charge")
    }
    if s.state == "done" && is_err(s.result) {
        return `refused: ${s.result}`
    }
    s.state
}
```
