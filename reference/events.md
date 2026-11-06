# events
events(fn, map | null=) -> response
group: Requests and pages

### What it does

A response of Server-Sent Events, sent as the function makes them. The function gets
`send`; each value given to it goes out as JSON in an event's `data`, with an event
name when `send` is given a second argument, and `send(null)` is a comment, which
keeps a quiet connection open. The second argument may be a map, `send(value, { event,
id, retry })`: the event's name, an id, which a browser sends back as `Last-Event-ID`
when it connects again (`listen` does), and `retry`, how many milliseconds it waits
before it does. `send(null, { id })` sends the id alone. The `content-type` is `text/event-stream` with
`cache-control: no-cache`. The options are `status` (200 unless given, 200 to 599,
but not 204, 205 or 304, which have no body) and `headers`, taken as
[respond](/docs/reference/respond/) takes them. A page follows the events with `listen`
or `receive`. See
[Streaming](/docs/routes/#streaming).

### Examples

```quillo noexec
route GET /jobs/:id/progress = events((send) => {
    for step in range(10) {
        work(id, step)
        send({ done: step + 1, of: 10 }, "progress")   // a value, and an event name
    }
})

// Goes on from where a dropped connection left off.
route GET /feed = events((send) => {
    let since = int(request.headers["last-event-id"] ?? "0") ?? 0
    for item in items_after(since) {
        send(item, { event: "item", id: str(item.id), retry: 2000 })
    }
})

component Progress(job: int) {
    state done = 0
    listen(`/jobs/${job}/progress`, (p) => { done = p.done })
    <progress value={done} max="10" />
}
```

The value can be made anywhere; its `status` and `headers` say what the head will be,
and its `body` is null, since the function makes the events while they are sent:

```quillo
let e = events((send) => send({ n: 1 }, "tick"))
print(e)
print(e.status, e.headers, e.body)
```

```output
<response 200>
200 { "content-type": "text/event-stream", "cache-control": "no-cache", "x-accel-buffering": "no" } null
```

### Edge cases

- There is no `type` option: an event stream is always `text/event-stream`, and a
  `type` given as text is ignored; one that is not text is an error, as for `stream`.
  `headers` can still replace any header, `content-type` included, and a header's
  `null` leaves it out (`{ "cache-control": null }` sends none).
- A status with no body (204, 205, 304), given as the option or by `reply`, is an error
  before anything is sent, as for `stream`.
- `x-accel-buffering: no` is set, so proxies pass events on as they come.
- The function runs when the answer is sent, not when `events` is called.
- When the client goes away, the next `send` ends the function, so a function that
  loops with `sleep` ends when the viewer leaves. Each open `listen` in a browser
  holds one of its six connections to the site; for data every page follows, `live`
  shares one WebSocket instead.
- An answer of events cannot be kept by `idempotent` and is not gzipped.
- An HTTP/1.0 client, which cannot read chunks, gets the events with no length, and the
  connection ends with the stream.
- An option of `send` other than `event`, `id` and `retry`, or a `retry` that is not a
  whole number of milliseconds, is a runtime error in the function: the stream ends
  there. An id or a name is written on one line.

```quillo
print(events((send) => send("x"), { type: "text/csv", status: 202 }).headers)
print(events((send) => send("x"), { headers: { "x-accel-buffering": "yes" } }).headers)
```

```output
{ "content-type": "text/event-stream", "cache-control": "no-cache", "x-accel-buffering": "no" }
{ "content-type": "text/event-stream", "cache-control": "no-cache", "x-accel-buffering": "yes" }
```

### Errors

A first argument that is not a function, options that are not a map, a `type` that is
not text, and a `status` outside 200 to 599 or with no body are runtime errors, not
error values.

```quillo error
print(events({ done: 1 }))
```

```output
line 1: `events` takes a function that sends, as in events((send) => send("...")), got map
```

```quillo error
print(events((send) => send("x"), { status: "200" }))
```

```output
line 1: `events`: status must be an int from 200 to 599, got "200"
```

### Chaining

`send` is a function, so it takes the end of a pipeline, and `http.stream` can be
handed it to pass another server's events straight on:

```quillo noexec
route GET /ticker = events((send) => { for q in quotes() { q | send } })

route POST /ask = events((send) => http.stream("https://api.example.com/v1/chat", send, {
    body: { prompt: request.json.prompt, stream: true },
    headers: { authorization: `Bearer ${env("API_KEY")}` },
}))
```

### See also

[stream](/docs/reference/stream/), [listen](/docs/reference/listen/), [receive](/docs/reference/receive/), [http.stream](/docs/reference/http.stream/), [live](/docs/reference/live/)
