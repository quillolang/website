# http.request
http.request(str, str, any=, map | null=, map | null=) -> map | error(str)
group: HTTP client

### What it does

Sends a request with any method: the method first, then the URL, a body, a map of
headers and a map of options (`redirects`, `public_only`, `cache` for GET, `timeout`).
The answer is a map `{ status, ok, headers, body, json }`, as
[http.get](/docs/reference/http.get/) gives. The method is upper-cased; the body is
sent as [http.post](/docs/reference/http.post/) sends one: text as `text/plain`, HTML as
`text/html`, other values as JSON, `null` nothing.

### Examples

```quillo noexec
http.request("PUT", url, body, { authorization: `Bearer ${token}` })
http.request("HEAD", url)                       // the headers alone, body ""
http.request("PROPFIND", url, null, { depth: "1" })
http.request("OPTIONS", url, null, {}, { timeout: 3 })
```

```quillo
print(http.request("get", "http://127.0.0.1:9/"))
print(http.request("PROPFIND", "not a url"))
```

```output
err("http: http://127.0.0.1:9/: Connection Failed: Connect error: Connection refused (os error 61)")
err("http: not an http(s) URL: not a url")
```

### Edge cases

- The method is any word, in either case: `"get"` is sent as `GET`.
- `cache` is allowed only when the method is GET; with another it is a runtime error.
- A body on a GET or a DELETE is sent when given; `http.get` and `http.delete` take
  none.
- A method the server does not know is answered with a 405 or 501, an answer with
  `ok` false.

```quillo
print(http.request("delete", "http://127.0.0.1:9/items/1", { reason: "spam" }))
print(http.request("GET", "http://127.0.0.1:9/", null, null, { cache: 60 }))
```

```output
err("http: http://127.0.0.1:9/items/1: Connection Failed: Connect error: Connection refused (os error 61)")
err("http: http://127.0.0.1:9/: Connection Failed: Connect error: Connection refused (os error 61)")
```

### Errors

A method that is not a string, a URL that is not one, headers that are not a map and an
unknown option are runtime errors; not reaching the server is an error value.

```quillo
let r = http.request("POST", "http://127.0.0.1:9/")
print(is_err(r), r.error)
```

```output
true http: http://127.0.0.1:9/: Connection Failed: Connect error: Connection refused (os error 61)
```

```quillo error
print(http.request(1, "http://127.0.0.1:9/"))
```

```output
line 1: `http.request` expects a method string first, got int
```

```quillo error
print(http.request("POST", "http://127.0.0.1:9/", {}, {}, { cache: 10 }))
```

```output
line 1: `http.request`: `cache` keeps the answers of GET requests, not POST
```

### Chaining

The method comes first, so a pipeline passes the method, not the URL: write the call
out. `?` passes an error value on to the caller.

```quillo noexec
fn call(method: str, path: str, body: any = null) with http {
    http.request(method, `${base}${path}`, body, { authorization: key }, { timeout: 10 })?
}
```

```quillo
print(["GET", "DELETE"] | map((m) => http.request(m, "http://127.0.0.1:9/") | is_err))
```

```output
[true, true]
```

### See also

[http.get](/docs/reference/http.get/), [http.post](/docs/reference/http.post/), [http.put](/docs/reference/http.put/), [http.patch](/docs/reference/http.patch/), [http.delete](/docs/reference/http.delete/), [http.stream](/docs/reference/http.stream/)
