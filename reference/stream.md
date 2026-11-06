# stream
stream(fn, map | null=) -> response
group: Requests and pages

### What it does

A response sent as the function makes it. The function gets `send`; text given to
`send` goes out as it is, any other value as a line of JSON. The client has the head at
once and each piece as it is sent, so a large export, a job's progress or a model's
reply need not be finished before the first byte goes. The options are `type` (the
`content-type`, `text/plain; charset=utf-8` unless given), `status` (200 unless given,
200 to 599, but not 204, 205 or 304, which have no body) and `headers`, taken as
[respond](/docs/reference/respond/) takes them. See [Streaming](/docs/routes/#streaming).

### Examples

```quillo noexec
route GET /orders.csv = stream((send) => {
    send("id,total\n")
    for o in db.query("select id, total from orders") { send(`${o.id},${o.total}\n`) }
}, { type: "text/csv", headers: { "content-disposition": "attachment" } })

route GET /log = stream((out) => { for line in tail_log() { out(line) } },
    { type: "text/plain", headers: { "cache-control": "no-store" } })
```

A page reads a stream with [listen](/docs/reference/listen/) (or `receive`, from a
click). With the type `application/x-ndjson`, each line is parsed as JSON and handed
over as it comes; a stream that ends is not opened again:

```quillo noexec
route GET /orders.ndjson = stream((send) => {
    for o in db.query("select id, total from orders") { send(json.stringify(o) + "\n") }
}, { type: "application/x-ndjson" })

component Orders() {
    state rows = []
    listen("/orders.ndjson", (o) => { rows = rows + [o] })     // one call per line
    <ul>{for o in rows => <li key={o.id}>#{o.id}: {o.total}</li>}</ul>
}

route GET / = <Orders/>
```

The value itself can be made anywhere; its `status` and `headers` say what the head
will be, and its `body` is null, since the function makes the body while it is sent:

```quillo
let s = stream((send) => send("hello"))
print(s)
print(s.status, s.headers)
print(stream((send) => send("x"), { type: "application/x-ndjson", status: 201 }).headers)
```

```output
<response 200>
200 { "content-type": "text/plain; charset=utf-8", "x-accel-buffering": "no" }
{ "content-type": "application/x-ndjson", "x-accel-buffering": "no" }
```

### Edge cases

- `x-accel-buffering: no` is always set, which asks proxies such as nginx not to hold
  the answer back; a header of the same name in `headers` replaces it, `null` leaves it
  out, and `headers` can replace `content-type` too, after `type`.
- A header's `null` is no such header, a list is one header per item for `set-cookie`
  alone, and a `location` that is a `javascript:`, `vbscript:` or `data:` URL is
  refused, as in `respond`.
- A status with no body (204, 205, 304), given as the option or by `reply 204
  stream(...)`, is an error before anything is sent, so no function runs after a head
  that says there is nothing to follow. For such an answer, `respond(204, null)`.
- The function runs when the answer is sent, not when `stream` is called: making the
  value prints nothing here.
- A value that is not text is sent as newline-delimited JSON, so a stream of maps
  wants `type: "application/x-ndjson"`.
- `send` waits only when the client reads slower than the program writes, as a
  database call does, holding up no other request. When the client goes away, the
  next `send` ends the function; an error in it after the head was sent cuts the
  connection, so the client knows the answer is incomplete. A streamed answer is not
  gzipped and cannot be kept by `idempotent`.
- The answer is chunked; to an HTTP/1.0 client, which cannot read chunks, it goes with
  no length and the connection ends with it. In a phone app or `quillo app`, where the
  program has no socket, the answer reaches the page whole, once the function ends.

```quillo
let s = stream((send) => { print("sending"); send("x") }, { headers: { "x-accel-buffering": "yes", "content-type": "text/csv" } })
print(s.headers)
```

```output
{ "x-accel-buffering": "yes", "content-type": "text/csv" }
```

### Errors

A first argument that is not a function, options that are not a map, a `type` that is
empty or holds a control character, a `status` outside 200 to 599 (or not an int) or
one with no body, and headers `respond` would refuse are runtime errors, not error
values. `send` exists only inside the function: it
is not a name of the program's own.

```quillo error
print(stream("id,total\n"))
```

```output
line 1: `stream` takes a function that sends, as in stream((send) => send("...")), got str
```

```quillo error
print(stream((send) => send("x"), { status: 199 }))
```

```output
line 1: `stream`: status must be an int from 200 to 599, got 199
```

```quillo error
print(stream((send) => send("x"), { status: 204 }))
```

```output
line 1: `stream` cannot answer 204: that status has no body, and what it sends would be read as the next answer; give respond(204, null)
```

### Chaining

A stream is a route's last value; what comes before it decides whether to stream at
all. Inside, `send` fits a pipeline as the function at its end:

```quillo noexec
route GET /names.txt = stream((send) => { for u in db.query("select name from users") { u.name + "\n" | send } })

route POST /ask = stream((send) => http.stream("https://api.example.com/v1/chat", send, {
    body: { prompt: request.json.prompt, stream: true },
    headers: { authorization: `Bearer ${env("API_KEY")}` },
}))
```

### See also

[events](/docs/reference/events/), [respond](/docs/reference/respond/), [http.stream](/docs/reference/http.stream/), [receive](/docs/reference/receive/), [listen](/docs/reference/listen/)
