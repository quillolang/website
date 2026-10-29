# cookie
cookie(str) -> str | null
group: Cookies and sessions

### What it does

The value of a cookie the browser sent with the request, decoded, or null when there
is none of that name. It works in any function the request runs (a route, a `server
fn`, a helper, a pipeline stage), so a helper that reads the visitor's time zone need
not be handed `request`. `request.cookies` is all of them as a map. Outside a request
(a job, a script) it is null. See [Headers, cookies and
sessions](/docs/guides/headers-cookies-sessions/#cookies).

### Examples

```quillo noexec
route GET / = <Page theme={cookie("theme") ?? "light"}><Home/></Page>

fn visitor_zone() = cookie("tz") ?? "UTC"

route GET /agenda = <Agenda zone={visitor_zone()} items={today(visitor_zone())}/>
```

```quillo
print(cookie("theme"))
print(cookie("theme") ?? "light")
```

```output
null
light
```

### Edge cases

- Not found is null, not the empty string, so `??` gives the default. A cookie set to
  the empty string reads as `""`.
- A cookie set with `set_cookie` earlier in the same request is not read back by
  `cookie`: it reads what the browser sent. Keep the value in a variable for the rest
  of the route.
- Cookies belong to the host they were set on, so each subdomain (each tenant) has its
  own.
- A cookie that the page's script set, or one from another program, is text like any
  other: convert it with `int` or `date` and check it.

```quillo
print(cookie("count"), int(cookie("count") ?? "0"))
set_cookie("count", "1")
print(cookie("count"))
```

```output
null 0
null
```

### Errors

A name that is not a string, or no name, is a runtime error, not an error value. An
unknown name is not an error: it is null.

```quillo error
print(cookie(42))
```

```output
line 1: `cookie` expects a cookie's name, got int
```

### Chaining

A cookie's value is text, so it starts a pipeline of conversions, with the default
given first:

```quillo
print(cookie("page") ?? "1" | int)
print(cookie("tags") ?? "a,b" | split(",") | map(upper))
```

```output
1
["A", "B"]
```

### See also

[set_cookie](/docs/reference/set_cookie/), [delete_cookie](/docs/reference/delete_cookie/), [session](/docs/reference/session/), [int](/docs/reference/int/)
