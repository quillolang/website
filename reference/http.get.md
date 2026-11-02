# http.get
http.get(str, map | null=, map | null=) -> map | error(str)
group: HTTP client

### What it does

Fetches a URL with GET and gives the answer as a map `{ status, ok, headers, body,
json }`: `ok` is true for a 2xx status, `headers` has its names in lower case, `body`
is the text (bytes that are not UTF-8 replaced, cut at 64 MiB) and `json` is the body
parsed as JSON, or null. A header the server sent more than once is one value, joined
with `, `; `set-cookie`, which cannot be joined so, has its lines joined by a line break,
and each one is also in `cookies`, a list. The second argument is a map of request
headers, the third a map of options: `redirects` (0 to 20; 5 unless given),
`public_only`, `cache` (seconds, up to a day), `timeout` (seconds, up to 300), `ca` (a
PEM file of the certificate authorities to trust instead of the usual public ones, or
`"system"` for the machine's own), and `cert` with `key` (PEM files: a client
certificate to present, as some banks' and governments' APIs ask). Every HTTP status
is an answer; an answer that cannot be had at all is an error value.

### Examples

```quillo noexec
let r = http.get("https://api.example.com/users/1")
if r.ok { print(r.json.name) } else { print(r.status, r.body) }

http.get(url, { authorization: `Bearer ${env("API_KEY")}` }, { timeout: 5 })
http.get("https://api.example.com/rates", {}, { cache: 60 })    // asked once a minute
```

A server that refuses the connection, and a URL that is not one:

```quillo
print(http.get("http://127.0.0.1:9/"))
print(http.get("not a url"))
```

```output
err("http: http://127.0.0.1:9/: Connection Failed: Connect error: Connection refused (os error 111)")
err("http: not an http(s) URL: not a url")
```

### Edge cases

- A URL that does not start with `http://` or `https://` is an error value, and nothing
  is connected to.
- A 404 or a 500 is an answer with `ok` false, not an error value; only failing to reach
  the server is one.
- `redirects: 0` makes a redirect the answer (its status and `location` header), not
  an error.
- `public_only: true` refuses this machine, private networks and a cloud's metadata
  address before connecting, so a URL someone else chose cannot reach inside.
- The headers and the options may each be `null`, as leaving them out.
- Requests say `User-Agent: quillo/<version>` unless the headers give another; some
  APIs refuse that one.
- Interim answers (`100`, `103 Early Hints`) are passed over to the final one.
- A redirect to the same host keeps `Authorization`; one to another origin drops it,
  and `Cookie` too.
- A body in `gzip`, `deflate` or `br` is decoded, and `content-encoding` is taken out
  of the headers; another coding (`zstd`) is an error value that names it.
- `HTTPS_PROXY`, `HTTP_PROXY` and `ALL_PROXY` (in either case) send the call through
  that proxy, unless `NO_PROXY` names its host (a name, `.domain` for it and below, an
  address, or `*`). A call to this machine (`localhost`, `127.0.0.1`, `::1`) never goes
  through one. With `public_only`, the host is looked up and checked before the call
  goes to the proxy.
- `ca`, `cert` and `key` are read from the program's folder, as `read_file` reads; one
  that cannot be read, or holds no certificate, makes the call an error value that says
  so.
- A policy limits where it may go, whatever the program asks (`/etc/quillo/policy.toml`,
  `quillo run main.qwe --policy FILE`, `quillo.policy` beside the program; see [the
  options](/docs/)). `[http] hosts` lists the hosts
  allowed (`api.stripe.com`, `*.mapbox.com` for its subdomains, `*` for any), and
  `private = false` refuses this machine, private networks and the cloud's metadata
  address, the name looked up first. Each redirect is judged too, hop by hop, so an
  allowed host cannot send the call somewhere else. What is refused is an error value
  that names the file: `http: 127.0.0.1 is an address of this machine or its network,
  which quillo.policy does not let a program reach`, or `http: example.net is not among
  the hosts quillo.policy allows: api.example.com`.

```quillo noexec
// quillo.policy beside the program:
//   [http]
//   private = false
//   hosts = ["api.example.com"]
print(http.get("http://127.0.0.1:9/"))     // err("http: 127.0.0.1 is not among the hosts quillo.policy allows: api.example.com")
```

```quillo
print(http.get("ftp://example.com/x"))
print(http.get("http://localhost:9/", null, null) | is_err)
print(http.get("http://127.0.0.1:9/", {}, { public_only: true }))
print(http.get("http://169.254.169.254/latest/meta-data/", {}, { public_only: true }))
```

```output
err("http: not an http(s) URL: ftp://example.com/x")
true
err("http: http://127.0.0.1:9/: refused by public_only: 127.0.0.1 is not on the public internet")
err("http: http://169.254.169.254/latest/meta-data/: refused by public_only: 169.254.169.254 is not on the public internet")
```

### Errors

Not reaching the server (refused, no such host, out of time, refused by `public_only`)
is an error value: check it with `is_err`, replace it with `??`, or pass it on with
`?`. The arguments are checked at once as runtime errors: a URL that is not a string,
headers that are not a map, an option that does not exist (`{ timout: 5 }` is not
ignored) or is out of range, `cert` without `key`, `ca` that is not a path or
`"system"`, and `cache` on another method than GET.

```quillo
let r = http.get("http://127.0.0.1:9/")
print(is_err(r), r.error)
print(http.get("http://127.0.0.1:9/") ?? "no rates today")
```

```output
true http: http://127.0.0.1:9/: Connection Failed: Connect error: Connection refused (os error 111)
no rates today
```

```quillo error
print(http.get("http://127.0.0.1:9/", {}, { timout: 5 }))
```

```output
line 1: `http.get`: unknown option `timout` (the options are redirects, public_only, cache, timeout, ca, cert, key)
```

```quillo error
print(http.get("http://127.0.0.1:9/", {}, { redirects: 21 }))
```

```output
line 1: `http.get`: `redirects` is a whole number from 0 to 20, got 21
```

```quillo error
print(http.get("https://127.0.0.1:9/", {}, { cert: "client.pem" }))
```

```output
line 1: `http.get`: `cert` and `key` go together: a certificate, and its key
```

### Chaining

The URL comes first, so a pipeline passes it: `url | http.get`. The answer is a map,
so `.json` and `.body` follow the call, and `?` in a route turns an error value into
the request's answer.

```quillo noexec
route GET /weather/:city {
    let r = http.get(`https://api.example.com/weather?q=${url_encode(city)}`, {}, { timeout: 5 })?
    r.json.temperature
}
```

```quillo
print("not a url" | http.get | is_err)
print(["http://127.0.0.1:9/a", "http://127.0.0.1:9/b"] | map(http.get) | filter(is_err) | len)
```

```output
true
2
```

### See also

[http.post](/docs/reference/http.post/), [http.delete](/docs/reference/http.delete/), [http.request](/docs/reference/http.request/), [http.stream](/docs/reference/http.stream/), [is_err](/docs/reference/is_err/), [json.parse](/docs/reference/json.parse/), [url_encode](/docs/reference/url_encode/)
