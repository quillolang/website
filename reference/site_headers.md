# site_headers
site_headers(str | map, map=) -> null
group: Requests and pages

### What it does

Headers sent with every answer that does not set them itself, written once at the top
of the program: `site_headers({ "content-security-policy": "default-src 'self'" })`, or
for the answers under a path, `site_headers("/admin", { "cache-control": "no-store" })`.
A longer path's rule wins over a shorter one's, and a route's own header (from
`respond`) over both. A null value takes away a header Quillo sends by itself:
`site_headers("/embed", { "x-frame-options": null })` lets other sites frame those
pages. It gives null.

Quillo's own: every HTML page gets `X-Frame-Options: SAMEORIGIN` unless the route or a
`Content-Security-Policy` with `frame-ancestors` says otherwise, and an answer made from
who the visitor is (it called `session()` or `cookie()`, or set a cookie) gets
`Cache-Control: private` and `Vary: Cookie`, so a shared cache does not give one
visitor's page to the next.

### Examples

```quillo noexec
site_headers({
    "strict-transport-security": "max-age=31536000",
    "referrer-policy": "strict-origin-when-cross-origin",
})
site_headers("/admin", { "cache-control": "no-store" })
site_headers("/embed", { "x-frame-options": null })
```

```quillo
print(site_headers({ "x-powered-by": "Quillo" }), site_headers("/api", { "x-api": 1 }))
```

```output
null null
```

### Edge cases

- Names are lower case on the wire; a value may be text, a number or a truth, on one
  line.
- `content-length`, `transfer-encoding`, `connection`, `set-cookie` and `content-type`
  belong to each answer, and are refused here.
- A `location` that is a `javascript:`, `vbscript:` or `data:` URL is refused, in any
  form a browser reads, as `redirect` and `respond` refuse it, naming the scheme given.

### Errors

A path that does not start with `/`, a name that is not a header's, a value over two
lines, a `location` that runs code or carries a page, or an answer's own header, is a
runtime error.

```quillo error
site_headers({ "set-cookie": "a=1" })
```

```output
line 1: `site_headers`: `set-cookie` is the answer's own; a route sets it
```

### Chaining

It stands on its own at the top of the program, next to `allow_cross_site`.

### See also

[respond](/docs/reference/respond/), [allow_cross_site](/docs/reference/allow_cross_site/), [set_cookie](/docs/reference/set_cookie/), [session](/docs/reference/session/)
