# respond
respond(int, any=, map | null=) -> response
group: Requests and pages

### What it does

A response with exactly the status, body and headers given. A route returns it when
the plain forms (html, a str, a map) are not enough: a status of its own, a header
such as `content-type` or `cache-control`, a 204 with nothing. The body is sent as a
plain return value would be (html as HTML, a str as text, a map or list as JSON,
null as nothing); header names are made lower case and values become text, but a
null one, which means no such header. The
status must be 200 to 599: a 1xx is an interim answer, after which the client waits for
the real one, so it is refused. The value's fields are `status`, `body` and `headers`.

### Examples

```quillo
let r = respond(201, { id: 7 }, { location: "/items/7" })
print(r)
print(r.status, r.body, r.headers)
print(respond(204).status, respond(204).body)
```

```output
<response 201>
201 { id: 7 } { location: "/items/7" }
204 null
```

```quillo noexec
route GET /api/stats = respond(200, site_stats(), { "cache-control": "public, max-age=60" })

route GET /export.csv = respond(200, csv_text(), {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": "attachment; filename=\"export.csv\"",
})

route POST /items { json: { name: str } } {
    let id = add_item(name)
    respond(201, { id }, { location: `/items/${id}` })
}
```

### Edge cases

- Header names are lower-cased; a value is text or a number, written as text. `null`
  means no such header: none is sent, not even the one Quillo would send itself, so
  `{ "cache-control": null }` leaves out the `private` a page with a session gets, and
  `{ server: null }` the `server: Quillo`. A header the route does not name keeps
  Quillo's. `.headers` shows such a header as null.
- A list is one header per item for `set-cookie` alone (`{ "set-cookie": ["a=1",
  "b=2"] }` sends two, `[]` none); for another header a list is an error, as a map is.
- A `location` that is a `javascript:`, `vbscript:` or `data:` URL is refused, in any
  form a browser reads (`JavaScript:`, a tab inside), as `redirect` refuses it, naming
  the scheme given: `` `respond` header `location` is not given a data: URL, got
  "data:..." ``.
- Without headers the map is empty: the server adds its own (`date`, `server`,
  `x-request-id`, `x-content-type-options`), and `content-length`,
  `transfer-encoding`, `connection` and `date` are the server's whatever is given.
- The body is kept as it is: html stays html, an error value stays an error value.
- A `205` goes out with no body, whatever is given, as HTTP asks; a `304` too. The
  status line carries its reason phrase (`418 I'm a teapot`, `451 Unavailable For Legal
  Reasons`).
- A route's answer with an `etag` header gets a `304` with no body when a GET or HEAD
  asks with a matching `If-None-Match`, as files do. Such an answer, or one with a
  `content-range`, goes out as it is: no prefetch or `--watch` script is added to it
  (`--watch` is the `quillo run` option that reloads open pages as the files change:
  `quillo run main.qwe --watch`; see [the options](/docs/)). A header set to `null`
  is none, so `{ etag: null }` keeps them.
- `reply status respond(...)` from a helper keeps the body and headers with the new
  status, so a helper can answer with headers too.

```quillo
print(respond(200, "x", { "X-Count": 42, "X-None": null }).headers)
print(respond(200).headers)
print(respond(200, <p>hi</p>).body)
print(respond(200, "x", { "set-cookie": ["a=1", "b=2"] }).headers)
```

```output
{ "x-count": "42", "x-none": null }
{}
<p>hi</p>
{ "set-cookie": ["a=1", "b=2"] }
```

```quillo noexec
fn open_for_business() {
    if env("MAINTENANCE") == "1" { reply 503 respond(503, "Back in a minute", { "retry-after": "60" }) }
}

route GET /checkout { open_for_business(); <CheckoutPage/> }
```

### Errors

A status outside 200 to 599 is a runtime error, and `quillo check` refuses a 1xx
written in the call. So is a header whose name has
anything but letters, digits and `-`, or whose value has a line break: text from a
request cannot add headers, or a whole response, of its own. Headers that are not a
map, a header's list or map (but a `set-cookie` list), a `location` that runs code or
carries a page, or a status that is not an int, are runtime errors too. None of these
is an error value.

```quillo error
print(respond(600, "x"))
```

```output
line 1: `respond` status must be 200-599, got 600
```

```quillo error
print(respond(103, "", { link: "</app.css>; rel=preload; as=style" }))
```

```output
line 1: `respond` status must be 200-599, got 103: a 1xx is an interim answer, and the client would wait for the real one
```

```quillo error
print(respond(200, "x", { "x-note": "a\r\nb" }))
```

```output
line 1: `respond` header `x-note`: names are letters, digits and -, values cannot contain line breaks
```

```quillo error
print(respond(200, "x", { "x-tags": ["a", "b"] }))
```

```output
line 1: `respond` header `x-tags` is a str, got list: only `set-cookie` takes a list, one header an item; join the values with ", "
```

### Chaining

In a pipeline the status would come first, which is rarely what is wanted; `respond`
usually ends a route or a pipeline stage instead, taking the value computed before it.

```quillo noexec
route GET /api/me = request | api.key | (r) => respond(200, { ip: r.ip, user: session().user }, { "cache-control": "no-store" })
```

```quillo
let found = [1, 2, 3] | filter((n) => n > 5)
print((len(found) == 0 ? respond(404, { error: "none" }) : respond(200, found)).status)
```

```output
404
```

### See also

[redirect](/docs/reference/redirect/), [stream](/docs/reference/stream/), [events](/docs/reference/events/), [file](/docs/reference/file/), [set_cookie](/docs/reference/set_cookie/)
