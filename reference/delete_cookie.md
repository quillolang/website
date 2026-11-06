# delete_cookie
delete_cookie(str, map | null=) -> null
group: Cookies and sessions

### What it does

Tells the browser to forget a cookie: a `Set-Cookie` for the name with an empty value
and `Max-Age=0` joins the request's answer, whatever the route returns. The options
are `path` and `domain`, which must be the ones the cookie was set with, or the
browser keeps it, and `http_only`, `secure` and `same_site`, as `set_cookie` takes
them; `max_age` only as 0, and another option is an error. It gives null. See
[Headers, cookies and sessions](/docs/headers-cookies-sessions/#cookies).

### Examples

The routes are posted to by a button on a page, a form of its own:
`<form method="post" action="/theme/reset"><button>Back to the default</button></form>`.
Its answer carries `set-cookie: theme=; Path=/; Max-Age=0`, and the page it redirects
to reads `cookie("theme")` as null.

```quillo noexec
route POST /theme/reset { delete_cookie("theme"); redirect("/") }

route POST /forget {
    db.exec("delete from remember where token = ?", cookie("remember"))
    delete_cookie("remember", { path: "/" })
    redirect("/")
}
```

```quillo
print(delete_cookie("theme"))
```

```output
null
```

### Edge cases

- Without options the deletion names `Path=/` (or the program's prefix when it is started with
  `quillo run main.qwe --base /shop`, or mounted) and no domain: the defaults `set_cookie` used. A cookie set with another
  `path` or `domain` needs the same ones here.
- Deleting a cookie the browser does not have is fine: the header goes out and
  nothing changes.
- A `cookie(name)` call in the same request still sees the value the browser sent.
- Deleting and setting one name in one request sends one `Set-Cookie`, the last, when
  both name the same path and domain; with another path both go out:
  `delete_cookie("theme", { path: "/old" })` and then `set_cookie("theme", "dark")`
  move the cookie from `/old` to `/`.
- A `__Host-` or `__Secure-` name's deletion is `Secure`, as browsers take it no other
  way.

```quillo
print(delete_cookie("theme", { path: "/", domain: "example.com" }))
print(delete_cookie("missing"))
```

```output
null
null
```

### Errors

A bad cookie name, no name, a `path` not starting with `/`, a `domain` that is not a
host name, an option it does not take (a `max_age` other than 0 too), and options that
are not a map are runtime errors, not error values.

```quillo error
delete_cookie()
```

```output
line 1: `delete_cookie` needs a cookie name
```

```quillo error
delete_cookie("theme", { path: "theme" })
```

```output
line 1: `delete_cookie`'s path starts with /, got "theme"
```

```quillo error
delete_cookie("theme", { max_age: 5 })
```

```output
line 1: `delete_cookie` has no option `max_age` but 0: a deleted cookie's age is 0
```

### Chaining

It is a statement before the route's answer, not a pipeline stage. To end a visit
fully, delete the cookies and end the session together:

```quillo noexec
route POST /logout {
    delete_cookie("remember")
    end_session()
    redirect("/")
}
```

### See also

[set_cookie](/docs/reference/set_cookie/), [cookie](/docs/reference/cookie/), [end_session](/docs/reference/end_session/)
