# http.patch
http.patch(str, any=, map | null=, map | null=) -> map | error(str)
group: HTTP client

### What it does

Sends a PATCH with a body, as [http.post](/docs/reference/http.post/) sends a POST,
and gives the answer as a map `{ status, ok, headers, body, json }`. A map or a list
goes as JSON, text as `text/plain`, HTML as `text/html`; `null` sends no body. Headers
come third, options (`redirects`, `public_only`, `timeout`) fourth.

### Examples

```quillo noexec
let r = http.patch(`https://api.example.com/users/${id}`, { role: "admin" })
print(r.status)

http.patch(url, patch, { "content-type": "application/json-patch+json" })
```

```quillo
print(http.patch("http://127.0.0.1:9/users/1", { role: "admin" }))
print(http.patch("not a url", { role: "admin" }))
```

```output
err("http: http://127.0.0.1:9/users/1: Connection Failed: Connect error: Connection refused (os error 61)")
err("http: not an http(s) URL: not a url")
```

### Edge cases

- The headers may give the `content-type`, for a PATCH format the server wants; the
  body is still a map sent as JSON text.
- `cache` is for GET: on a PATCH it is a runtime error.
- A 422 (the server refused the change) is an answer with `ok` false, not an error
  value.

```quillo
print(http.patch("http://127.0.0.1:9/users/1", null, { authorization: "x" }))
print(http.patch("http://127.0.0.1:9/users/1", [{ op: "replace", path: "/role", value: "admin" }], {}, { timeout: 2 }))
```

```output
err("http: http://127.0.0.1:9/users/1: Connection Failed: Connect error: Connection refused (os error 61)")
err("http: http://127.0.0.1:9/users/1: Connection Failed: Connect error: Connection refused (os error 61)")
```

### Errors

Not reaching the server is an error value; a bad argument or option is a runtime
error.

```quillo
let r = http.patch("http://127.0.0.1:9/users/1", { role: "admin" })
print(is_err(r), r.error)
```

```output
true http: http://127.0.0.1:9/users/1: Connection Failed: Connect error: Connection refused (os error 61)
```

```quillo error
print(http.patch("http://127.0.0.1:9/users/1", {}, {}, { timeout: 0 }))
```

```output
line 1: `http.patch`: `timeout` is seconds, more than 0 and up to 300, got 0
```

### Chaining

The URL is the first argument; `?` passes an error value on.

```quillo noexec
route POST /users/:id/promote {
    http.patch(`${upstream}/users/${id}`, { role: "admin" })?
    redirect(`/users/${id}`)
}
```

```quillo
print("not a url" | http.patch({ a: 1 }) | is_err)
```

```output
true
```

### See also

[http.post](/docs/reference/http.post/), [http.put](/docs/reference/http.put/), [http.request](/docs/reference/http.request/), [http.get](/docs/reference/http.get/), [is_err](/docs/reference/is_err/)
