# http.post
http.post(str, any=, map | null=, map | null=) -> map | error(str)
group: HTTP client

### What it does

Sends a POST with a body and gives the answer as a map `{ status, ok, headers, body,
json }`, as [http.get](/docs/reference/http.get/) does. The body is sent as it is when
it is text (`text/plain`) or HTML (`text/html`), and as JSON otherwise (a map, a list,
a number, a decimal); `null` sends no body. Headers come third and may give another
`content-type`; the options (`redirects`, `public_only`, `timeout`) come fourth.

### Examples

```quillo noexec
let r = http.post("https://api.example.com/users", { name: "Ada" })
print(r.status, r.json.id)

http.post(hook, "deploy finished")                                 // text/plain
http.post(url, "a=1&b=2", { "content-type": "application/x-www-form-urlencoded" })
http.post(url, body, { authorization: `Bearer ${key}` }, { timeout: 10 })
```

```quillo
print(http.post("http://127.0.0.1:9/users", { name: "Ada" }))
print(http.post("not a url", { name: "Ada" }))
```

```output
err("http: http://127.0.0.1:9/users: Connection Failed: Connect error: Connection refused (os error 61)")
err("http: not an http(s) URL: not a url")
```

### Edge cases

- A body that is a map or a list goes as JSON with `content-type: application/json`;
  a string goes as it is, as `text/plain`.
- No body (`null`, or left out) sends a POST without one.
- `cache` is for GET: giving it on a POST is a runtime error, since an answer to a
  POST is not the same twice.
- A 4xx or 5xx is an answer with `ok` false and the error's `body`, not an error value.

```quillo
print(http.post("http://127.0.0.1:9/ping"))
print(http.post("http://127.0.0.1:9/ping", null, null, { redirects: 0 }))
print(http.post("http://127.0.0.1:9/ping", "hello", {}, { public_only: true }))
```

```output
err("http: http://127.0.0.1:9/ping: Connection Failed: Connect error: Connection refused (os error 61)")
err("http: http://127.0.0.1:9/ping: Connection Failed: Connect error: Connection refused (os error 61)")
err("http: http://127.0.0.1:9/ping: refused by public_only: 127.0.0.1 is not on the public internet")
```

### Errors

Not reaching the server is an error value; the arguments are checked at once as runtime
errors: a URL that is not a string, headers that are not a map, an option that does not
exist, `cache`.

```quillo
let r = http.post("http://127.0.0.1:9/users", { name: "Ada" })
print(is_err(r), r.error)
print(http.post("http://127.0.0.1:9/users", {}) ?? "queued for later")
```

```output
true http: http://127.0.0.1:9/users: Connection Failed: Connect error: Connection refused (os error 61)
queued for later
```

```quillo error
print(http.post("http://127.0.0.1:9/users", {}, {}, { cache: 10 }))
```

```output
line 1: `http.post`: `cache` keeps the answers of GET requests, not POST
```

### Chaining

The URL comes first in a pipeline, so the body cannot be piped in; write the call out.
`?` passes an error value on, and `.json` reads the answer.

```quillo noexec
route POST /signup { form: { email: str } } {
    let r = http.post(`${crm}/contacts`, { email }, { authorization: key })?
    if !r.ok { reply 502 "the CRM is down" }
    redirect("/welcome")
}
```

```quillo
print("not a url" | http.post({ a: 1 }) | is_err)
```

```output
true
```

### See also

[http.put](/docs/reference/http.put/), [http.patch](/docs/reference/http.patch/), [http.get](/docs/reference/http.get/), [http.request](/docs/reference/http.request/), [json.stringify](/docs/reference/json.stringify/), [is_err](/docs/reference/is_err/)
