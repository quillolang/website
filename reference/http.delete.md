# http.delete
http.delete(str, map | null=, map | null=) -> map | error(str)
group: HTTP client

### What it does

Sends a DELETE to a URL, with no body, and gives the answer as a map `{ status, ok,
headers, body, json }`, as [http.get](/docs/reference/http.get/) does. The second
argument is a map of request headers, the third a map of options: `redirects`,
`public_only` and `timeout`. Every HTTP status is an answer; failing to reach the
server is an error value.

### Examples

```quillo noexec
let r = http.delete(`https://api.example.com/items/${id}`, { authorization: `Bearer ${key}` })
if !r.ok { reply 502 `could not delete: ${r.status}` }
```

```quillo
print(http.delete("http://127.0.0.1:9/items/1"))
print(http.delete("not a url"))
```

```output
err("http: http://127.0.0.1:9/items/1: Connection Failed: Connect error: Connection refused (os error 111)")
err("http: not an http(s) URL: not a url")
```

### Edge cases

- There is no body argument: a DELETE with a body is `http.request("DELETE", url,
  body)`.
- A 404 for something already gone is an answer with `ok` false and `status` 404, not
  an error value.
- `cache` is for GET: giving it here is a runtime error.
- `public_only: true` refuses addresses that are not on the public internet before
  connecting.

```quillo
print(http.delete("http://127.0.0.1:9/items/1", null, { timeout: 2, redirects: 0 }))
print(http.delete("http://127.0.0.1:9/items/1", {}, { public_only: true }))
```

```output
err("http: http://127.0.0.1:9/items/1: Connection Failed: Connect error: Connection refused (os error 111)")
err("http: http://127.0.0.1:9/items/1: refused by public_only: 127.0.0.1 is not on the public internet")
```

### Errors

Not reaching the server is an error value; a bad argument (a URL that is not a string,
headers that are not a map, an unknown option, `cache`) is a runtime error.

```quillo
let r = http.delete("http://127.0.0.1:9/items/1")
print(is_err(r), r.error)
```

```output
true http: http://127.0.0.1:9/items/1: Connection Failed: Connect error: Connection refused (os error 111)
```

```quillo error
print(http.delete("http://127.0.0.1:9/items/1", {}, { cache: 10 }))
```

```output
line 1: `http.delete`: `cache` keeps the answers of GET requests, not DELETE
```

### Chaining

The URL is the first argument, so `url | http.delete` works, and `?` passes an error
value on to the caller.

```quillo noexec
route DELETE /items/:id {
    http.delete(`${upstream}/items/${id}`)?
    redirect("/items")
}
```

```quillo
print("http://127.0.0.1:9/x" | http.delete | is_err)
```

```output
true
```

### See also

[http.get](/docs/reference/http.get/), [http.post](/docs/reference/http.post/), [http.request](/docs/reference/http.request/), [is_err](/docs/reference/is_err/)
