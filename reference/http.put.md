# http.put
http.put(str, any=, map | null=, map | null=) -> map | error(str)
group: HTTP client

### What it does

Sends a PUT with a body, as [http.post](/docs/reference/http.post/) sends a POST, and
gives the answer as a map `{ status, ok, headers, body, json }`. Text goes as
`text/plain`, HTML as `text/html`, any other value as JSON; `null` sends no body.
Headers come third, options (`redirects`, `public_only`, `timeout`) fourth.

### Examples

```quillo noexec
let r = http.put(`https://api.example.com/users/${id}`, { name: "Ada", role: "admin" })
print(r.ok)

http.put(`${bucket}/${key}`, contents, { "content-type": "text/csv" })
```

```quillo
print(http.put("http://127.0.0.1:9/users/1", { name: "Ada" }))
print(http.put("not a url", "text"))
```

```output
err("http: http://127.0.0.1:9/users/1: Connection Failed: Connect error: Connection refused (os error 61)")
err("http: not an http(s) URL: not a url")
```

### Edge cases

- A map or a list goes as JSON, a string as text; a number or a decimal goes as JSON
  too.
- `cache` is for GET: on a PUT it is a runtime error.
- Every HTTP status is an answer: a 409 for a version conflict has `ok` false and the
  server's `body`, and is not an error value.

```quillo
print(http.put("http://127.0.0.1:9/users/1"))
print(http.put("http://127.0.0.1:9/users/1", "v2", { "if-match": "\"abc\"" }, { timeout: 2 }))
```

```output
err("http: http://127.0.0.1:9/users/1: Connection Failed: Connect error: Connection refused (os error 61)")
err("http: http://127.0.0.1:9/users/1: Connection Failed: Connect error: Connection refused (os error 61)")
```

### Errors

Not reaching the server is an error value; a bad argument or option is a runtime
error.

```quillo
let r = http.put("http://127.0.0.1:9/users/1", { name: "Ada" })
print(is_err(r), r.error)
```

```output
true http: http://127.0.0.1:9/users/1: Connection Failed: Connect error: Connection refused (os error 61)
```

```quillo error
print(http.put("http://127.0.0.1:9/users/1", {}, "not headers"))
```

```output
line 1: `http.put` expects headers as a map, got str
```

### Chaining

The URL is the first argument. In a route, `?` passes an error value on as the
request's answer.

```quillo noexec
route PUT /users/:id { json: { name: str } } {
    http.put(`${upstream}/users/${id}`, { name })?
    { ok: true }
}
```

```quillo
print("not a url" | http.put({ a: 1 }) | is_err)
```

```output
true
```

### See also

[http.post](/docs/reference/http.post/), [http.patch](/docs/reference/http.patch/), [http.request](/docs/reference/http.request/), [http.get](/docs/reference/http.get/), [is_err](/docs/reference/is_err/)
