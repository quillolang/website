# receive
receive(str, fn, map | null=) -> null | error(str)
group: Browser

### What it does

In an event handler of a component, sends a request and calls `f` with what the answer
streams, piece by piece, until it ends: each event's data (parsed as JSON when it is
JSON, with the event's name as a second parameter when `f` declares one), each line of
newline-delimited JSON, or each piece of text. The options are `method`, `body` and
`headers`. It gives `null` once the stream has ended, or an error value when the
answer could not be had. The handler waits for it.

### Examples

```quillo noexec
route POST /ask = events((send) => http.stream("https://api.example.com/v1/chat", send, {
    body: { prompt: request.json.prompt, stream: true },
    headers: { authorization: `Bearer ${env("API_KEY")}` },
}))

component Chat() {
    state prompt = ""
    state answer = ""
    state problem = null
    <div>
        <input bind:value={prompt}/>
        <button @click={() => {
            answer = ""
            let r = receive("/ask", (part) => { answer = answer + part.text }, { body: { prompt } })
            problem = is_err(r) ? r.error : null
        }}>Ask</button>
        <p>{answer}</p>
        {problem && <p class="error">{problem}</p>}
    </div>
}
```

### Edge cases

- Without `method`, the request is a GET when there is no `body` and a POST when
  there is. A map body goes as JSON; a file from an input goes as it is, with its own
  type.
- `f` returning `false` stops the stream and cancels the rest of the answer.
- An answer that is not a success is the error value `receive: 404 ...` with the
  status and the body's text; a connection that fails is `receive:` and the browser's
  message. It is not tried again: that is the handler's choice.
- State assigned in `f` shows as the pieces arrive; what the handler does after
  `receive` runs once the stream has ended.
- It is called from an event handler or `@mount`, where code can wait. In the
  component's own code it is refused when the program loads: `` `receive` waits on the
  server, so a component can only call it from an event handler (@click={() => { ... }})
  or to set state: state x = receive(...) ``. A stream the component should follow by
  itself is `listen`.
- On the server it sends nothing and gives `null`.
- `quillo check` wants the function: `receive("/x")` is `` missing argument `arg2` in
  call to `receive` ``.

```quillo
print(receive("/ask", (part) => part, { body: { prompt: "hi" } }))
```

```output
null
```

### Errors

A URL that is not a string, or a second argument that is not a function, is a runtime
error, not an error value, on the server as in the browser. A request that fails is an
error value, checked with `is_err` or given a default with `??`.

```quillo error
print(receive(42, (part) => part))
```

```output
line 1: `receive` takes a URL and a function: receive("/reply", (t) => { text = text + t })
```

### Chaining

The result is checked after the stream, as a `server fn` call's is:

```quillo noexec
@click={() => {
    let r = receive("/export", (line) => { rows = rows + [line] })
    if is_err(r) { notify("Export failed", { tone: "danger" }) }
}}
```

### See also

[listen](/docs/reference/listen/), [events](/docs/reference/events/), [stream](/docs/reference/stream/), [http.stream](/docs/reference/http.stream/), [http.post](/docs/reference/http.post/)
