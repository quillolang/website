# allow_cross_site
allow_cross_site(str) -> null
group: Requests and pages

### What it does

Lets the routes under a path take form posts from pages on other sites. A `POST`,
`PUT`, `PATCH` or `DELETE` with a form, multipart or plain-text body (or none) that the
browser marks as coming from another site (`Sec-Fetch-Site`, or an `Origin` naming
another host) is refused with 403 before any route runs. A payment provider's return
page or a single sign-on callback needs such a post: say so at the top of the program,
once per path. It gives null.

### Examples

```quillo noexec
allow_cross_site("/payments/return")
allow_cross_site("/sso")

route POST /payments/return { form: { order: str, status: str } } {
    record_payment(order, status)
    redirect(`/orders/${order}`)
}

route POST /sso { form: { token: str } } {
    let user = user_from_token(token) ?? reply 401 "Bad token"
    set_session({ user: user.id })
    redirect("/")
}
```

```quillo
print(allow_cross_site("/sso"))
```

```output
null
```

### Edge cases

- The path must start with `/`. The routes under it take cross-site posts; the rest of
  the program is protected as before.
- JSON from another site needs the browser to ask first with an `OPTIONS` request,
  which nothing answers by itself, and programs that call the site (webhooks, scripts)
  send no `Origin`: both work without `allow_cross_site`.
- Calling it several times, for several paths, is fine; the same path twice is fine
  too. In a plain program it changes nothing, since nothing is served.

```quillo
print(allow_cross_site("/payments/return"), allow_cross_site("/payments/return"))
```

```output
null null
```

### Errors

A path that does not start with `/`, or that is not a string, is a runtime error, not
an error value.

```quillo error
allow_cross_site("sso")
```

```output
line 1: `allow_cross_site` needs a path that starts with /, got "sso"
```

### Chaining

It stands on its own at the top of the program, next to `tenant_from` and `schedule`.
A value piped into it is the path, which reads less clearly than writing the path:

```quillo
print("/sso" | allow_cross_site)
```

```output
null
```

### See also

[respond](/docs/reference/respond/), [redirect](/docs/reference/redirect/), [set_session](/docs/reference/set_session/), [tenant_from](/docs/reference/tenant_from/)
