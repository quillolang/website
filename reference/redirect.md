# redirect
redirect(str, int=) -> response
group: Requests and pages

### What it does

A response that sends the browser to another address: a status of 303 unless one is
given, and a `location` header with the URL. A route returns it as its answer, usually
after a form has been handled, so that a reload of the page does not post the form
again. The status must be 300 to 399. The value can be looked at: `status`, `headers`
and `body` (always null) are its fields.

### Examples

```quillo
let r = redirect("/")
print(r)
print(r.status, r.headers, r.body)
print(redirect("https://example.com/", 301).status)
```

```output
<response 303>
303 { location: "/" } null
301
```

```quillo noexec
route POST /login { form: { email: str, password: str } } {
    let user = db.one("select * from users where email = ?", email)
    let hash = user.password_hash ?? crypto.hash_password("not anyone's")
    if user == null || !crypto.verify_password(password, hash) { reply 401 "Wrong email or password" }
    set_session({ user: user.id })
    redirect("/")
}

route GET /old-page = redirect("/new-page", 301)
```

### Edge cases

- 303 makes browsers follow with a `GET`, whatever method the request used: the right
  answer after a `POST`. 301 and 308 are permanent and browsers remember them; 307 and
  308 keep the method.
- The URL is sent as given: a relative one (`"next"`) and the empty string are allowed,
  and nothing is encoded, so build a query with `url_encode`.
- The body is null: the redirect carries nothing but its headers. Cookies set in the
  request with `set_cookie` or `set_session` go out with it.
- Every call makes a new response value; two redirects to one address are not equal.

```quillo
print(redirect("next").headers, redirect("").headers)
print(redirect(`/login?next=${url_encode("/orders?page=2")}`).headers)
print(redirect("/x") == redirect("/x"))
```

```output
{ location: "next" } { location: "" }
{ location: "/login?next=%2Forders%3Fpage%3D2" }
false
```

### Errors

A status outside 300 to 399 is a runtime error, as is a URL with a line break or
another control character (text from a request cannot add headers of its own), or a
URL that is not a string. None of these is an error value.

```quillo error
print(redirect("/", 200))
```

```output
line 1: `redirect` status must be 300-399, got 200
```

```quillo error
print(redirect("/a\nb"))
```

```output
line 1: `redirect` URL cannot contain line breaks or other control characters
```

### Chaining

A redirect ends a request from inside a helper with `reply`: `reply 303 redirect(url)`
sends it from wherever the helper is called, so one `me_or_login` serves every page
that needs a visitor (see [Requiring a session](/docs/guides/headers-cookies-sessions/#requiring-a-session)).

```quillo noexec
fn me_or_login(back: str) = me() ?? reply 303 redirect(`/login?next=${url_encode(back)}`)

route GET /account = <AccountPage me={me_or_login("/account")}/>
```

```quillo
print("/dashboard" | redirect(302) | (r) => r.status)
```

```output
302
```

### See also

[respond](/docs/reference/respond/), [url_encode](/docs/reference/url_encode/), [set_session](/docs/reference/set_session/), [navigate](/docs/reference/navigate/)
