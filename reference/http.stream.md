# http.stream
http.stream(str, fn, map | null=) -> map | error(str)
group: HTTP client

### What it does

Reads another server's answer as it arrives, calling `f` with each piece: each
Server-Sent Event (its data, parsed as JSON when it is, and its name), each line of
newline-delimited JSON, or each piece of plain text, by the answer's `content-type`.
`f` may stop the stream by returning `false`. The options map holds the request's
`method`, `body` and `headers` (POST when a body is given, GET otherwise) and
`redirects`, `public_only` and `timeout`. Once the answer has ended it gives `{ status,
ok, headers }`, with the `body` as well when the status is not a success; an answer
that cannot be had is an error value.

### Examples

```quillo noexec
// A model's answer, passed on to the page as it arrives.
route POST /ask = events((send) => http.stream("https://api.example.com/v1/chat", send, {
    body: { prompt: request.json.prompt, stream: true },
    headers: { authorization: `Bearer ${env("API_KEY")}` },
}))

// The first ten lines of a log that never ends.
let n = 0
let r = http.stream("https://logs.example.com/tail", (line) => {
    print(line)
    n = n + 1
    n < 10
})
```

```quillo
print(http.stream("http://127.0.0.1:9/events", (e) => print(e)))
print(http.stream("not a url", (e) => print(e)))
```

```output
err("http: http://127.0.0.1:9/events: Connection Failed: Connect error: Connection refused (os error 111)")
err("http: not an http(s) URL: not a url")
```

### Edge cases

- `f` is called with as many arguments as it declares: `(data)` gets each event's data
  alone, `(data, name)` its name too.
- A `body` makes the request a POST unless `method` says otherwise; `method` is
  upper-cased.
- An answer that is not a success (a 401, a 500) is read whole and given with its
  `body`, and `f` is not called.
- An event or a line that goes past 16 MiB without ending is an error value.
- Silence of 300 seconds between pieces ends the call unless `timeout` says otherwise.
- `cache` keeps whole answers and is not an option here: a runtime error.

```quillo
print(http.stream("http://127.0.0.1:9/events", print, { body: { q: 1 } }))
print(http.stream("http://127.0.0.1:9/events", print, { method: "get", timeout: 2 }))
```

```output
err("http: http://127.0.0.1:9/events: Connection Failed: Connect error: Connection refused (os error 111)")
err("http: http://127.0.0.1:9/events: Connection Failed: Connect error: Connection refused (os error 111)")
```

### Errors

Not reaching the server is an error value, as is a stream cut by the connection. A URL
that is not a string, a second argument that is not a function, an option that does not
exist and `cache` are runtime errors.

```quillo
let r = http.stream("http://127.0.0.1:9/events", (e) => print(e))
print(is_err(r), r.error)
```

```output
true http: http://127.0.0.1:9/events: Connection Failed: Connect error: Connection refused (os error 111)
```

```quillo error
print(http.stream("http://127.0.0.1:9/events", "not a function"))
```

```output
line 1: `http.stream` takes a function for what arrives, got str
```

```quillo error
print(http.stream("http://127.0.0.1:9/events", print, { cache: 60 }))
```

```output
line 1: `http.stream`: `cache` keeps whole answers, of `http.get`
```

### Chaining

Given `send` from [events](/docs/reference/events/) or [stream](/docs/reference/stream/) as
`f`, what arrives goes straight on to the page. The URL comes first in a pipeline; the
answer map is what the call gives once the stream ends.

```quillo noexec
route GET /relay = stream((send) => {
    let r = http.stream(upstream, send)
    if is_err(r) { send(`error: ${r.error}`) }
})
```

```quillo
print("not a url" | http.stream(print) | is_err)
```

```output
true
```

### See also

[http.get](/docs/reference/http.get/), [http.post](/docs/reference/http.post/), [events](/docs/reference/events/), [stream](/docs/reference/stream/), [receive](/docs/reference/receive/), [listen](/docs/reference/listen/)
