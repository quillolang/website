# listen
listen(str, fn) -> null
group: Browser

### What it does

In a component's code, follows a stream the server sends (a route made with `events`
or `stream`) for as long as the code that called it stands: `f` is called with each
event's data (parsed as JSON when it is JSON, and the event's name as a second
parameter when `f` declares one), each line of newline-delimited JSON, or each piece of
text. A connection that drops is opened again (after a second, doubling up to 30 s); a
stream that ends is not. It gives `null`.

### Examples

```quillo noexec
route GET /jobs/:id/progress = events((send) => {
    for step in range(10) {
        work(id, step)
        send({ done: step + 1, of: 10 }, "progress")
    }
})

component Progress(job: int) {
    state done = 0
    listen(`/jobs/${job}/progress`, (p) => { done = p.done })
    <progress value={done} max="10"/>
}
```

```quillo noexec
component Ticker(symbol: str) {
    state price = null
    state open = true
    if open { listen(`/prices/${symbol}`, (p, event) => { if event == "close" { open = false } else { price = p.last } }) }
    <span>{price ?? "..."}</span>
}
```

### Edge cases

- `f` returning `false` stops the stream and closes the connection.
- The request is a GET with `accept: text/event-stream, application/x-ndjson`; the kind
  is told by the answer's `content-type`: events, lines of JSON, or plain text in
  pieces as they arrive.
- An answer that is not a success (404, 500) counts as a dropped connection and is
  tried again, after a second, then longer. It is not an error value.
- What a statement starts, it stops: `if open { listen(...) }` closes the stream when
  `open` turns false, and when the component leaves the page, and opens it afresh when
  the URL it read changes.
- It is called from the component's code, not from an event handler, where it is an
  error in the browser (`` `listen` works in a component ``, in the console) that
  `quillo check` does not see. For a stream a click starts, use `receive`.
- Each open `listen` holds one of the six connections a browser keeps to a site over
  HTTP/1.1; for data every page follows, `live` shares one WebSocket.
- While the server renders the component it opens nothing and gives `null`; a component
  that calls it loads its bundle as soon as the page is idle.
- `quillo check` wants both arguments: `listen("/x")` is `` missing argument `arg2` in
  call to `listen` ``.

```quillo
print(listen("/progress", (p) => p))
```

```output
null
```

### Errors

A URL that is not a string, or a second argument that is not a function, is a runtime
error, not an error value, on the server as in the browser.

```quillo error
print(listen(42, (p) => p))
```

```output
line 1: `listen` takes a URL and a function: listen("/progress", (p) => { done = p.done })
```

### Chaining

`listen` is a statement: nothing is piped out of it. Its function is where the data
goes on:

```quillo noexec
listen("/log", (line) => { lines = take(lines + [line], 100) })
```

### See also

[receive](/docs/reference/receive/), [events](/docs/reference/events/), [stream](/docs/reference/stream/), [live](/docs/reference/live/), [every](/docs/reference/every/), [channel.open](/docs/reference/channel.open/)
