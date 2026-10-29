# set_cookie
set_cookie(str, any=, map | null=) -> null
group: Cookies and sessions

### What it does

Adds a `Set-Cookie` header to the request's answer, whatever the route returns, from
anywhere in the request: a route, a `server fn`, a helper. The value is percent-encoded
on the way out and decoded by `cookie`, so any text fits; a value that is not a string
is written as text, and none as the empty string. The options are `max_age`, `path`,
`domain`, `http_only`, `secure` and `same_site`; without them a cookie is `HttpOnly`,
`Secure`, `SameSite=Lax`, for `Path=/`, and lasts until the browser closes. It gives
null. The guide [Headers, cookies and
sessions](/docs/guides/headers-cookies-sessions/#cookies) has the options' table.

### Examples

```quillo noexec
route POST /theme { form: { theme: str } } {
    set_cookie("theme", theme, { max_age: "1y" })
    redirect("/")
}

route GET / = <Page theme={cookie("theme") ?? "light"}><Home/></Page>

route POST /tz { form: { tz: str } } {
    set_cookie("tz", tz, { max_age: "1y", http_only: false })   // the page's script may read it
    { ok: true }
}
```

Outside a request there is no answer to carry the cookie; the call still checks its
arguments and gives null:

```quillo
print(set_cookie("theme", "dark", { max_age: "30d" }))
print(cookie("theme"))
```

```output
null
null
```

### Edge cases

- `max_age` is seconds or a duration: `"30d"` with `s`, `m`, `h`, `d`, `w`, `y`.
  Without it the cookie is a session cookie, gone when the browser closes.
- `same_site: "None"` makes the cookie `Secure` whatever `secure` says: browsers take
  it no other way. `Secure` is left out with `--watch`, `--plain-http` and in desktop
  apps, where the site is served over plain HTTP.
- A cookie set twice in one request is sent once, the last. An option that is not
  known is ignored.
- A name is letters, digits and ``-_.!#$%&'*+^`|~``; a value that is not a string is
  written as text (`42`), and a missing or null value as the empty string.
- Under `--base` or in a mounted program, the default `path` is that prefix.
- Keep secrets out: the browser, and anything on the machine, can read a cookie. For
  "remember me", store a random token in the database and put only the token in the
  cookie.

```quillo
print(set_cookie("n", 42), set_cookie("n"), set_cookie("n", null))
print(set_cookie("a", "b", { same_site: "None", colour: "ignored" }))
```

```output
null null null
null
```

### Errors

A bad cookie name, a `max_age` that is not seconds or a duration, a `path` not starting
with `/`, a `domain` that is not a host name, a `same_site` other than `"Lax"`,
`"Strict"` or `"None"`, and options that are not a map are runtime errors, not error
values.

```quillo error
set_cookie("bad name", "x")
```

```output
line 1: `set_cookie` needs a cookie name of letters, digits and -_.!#$%&'*+^`|~, got "bad name"
```

```quillo error
set_cookie("a", "b", { same_site: "nope" })
```

```output
line 1: `set_cookie`'s same_site is "Lax", "Strict" or "None", got "nope"
```

### Chaining

`set_cookie` is a statement with a side effect, so it sits on its own line before the
route's answer rather than in a pipeline. A helper can set a cookie and give its value
back for the rest of the route:

```quillo noexec
fn remember_theme(theme: str) { set_cookie("theme", theme, { max_age: "1y" }); theme }

route POST /theme { form: { theme: str } } = <Page theme={remember_theme(theme)}><Home/></Page>
```

### See also

[cookie](/docs/reference/cookie/), [delete_cookie](/docs/reference/delete_cookie/), [set_session](/docs/reference/set_session/), [respond](/docs/reference/respond/)
