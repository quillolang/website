# redirect
redirect(str, int=) -> response
group: Requests and pages

### What it does

A response that sends the browser to another address: a status of 303 unless one is
given, and a `location` header with the URL. A route returns it as its answer, usually
after a form has been handled, so that a reload of the page does not post the form
again. The status is 301, 302, 303, 307 or 308, and the URL no `javascript:`,
`vbscript:` or `data:` one. The `location` is written as a URL holds it, percent-encoded
where it must be. The value can be looked at: `status`, `headers` and `body` (always
null) are its fields.

It makes an answer; it does not leave. With more code after it, as in
`if no_user { redirect("/login") }`, the route goes on and shows the page: write
`reply 303 redirect("/login")`. `quillo check` warns of one nothing takes.

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
- A relative URL (`"next"`) and the empty string are allowed. What a URL cannot hold
  is percent-encoded (`/a b` is `/a%20b`, `/é` is `/%C3%A9`), a `%XX` already there is
  kept, and a non-ASCII host is written as IDNA (`bücher.de` is `xn--bcher-kva.de`).
  A `&` or `?` in a value is not encoded, so build a query with `url_encode`.
- A `\` is read as browsers read it: in `http(s)`, `ws(s)`, `ftp`, `file` and relative
  URLs it is a `/` before the query, so a check that the URL starts with
  `https://good.com` holds for `https://good.com\@evil.com/`, which goes to good.com.
- A path of the site's own, starting with `/`, stays on the site: a `\` among its
  leading slashes is `%5C` (`/\evil.com` is `/%5Cevil.com`, so a check for `/` and not
  `//` holds), and its `.` and `..` segments (`%2e` too) are taken out before `--base`
  (`quillo run main.qwe --base /shop`) is put in front, so `..` cannot climb out of it.
- The body is null: the redirect carries nothing but its headers. Cookies set in the
  request with `set_cookie` or `set_session` go out with it.
- Every call makes a new response value; two redirects to one address are not equal.
- A `javascript:`, `vbscript:` or `data:` URL is refused however it is written
  (`"  JaVaScRiPt:"`, with tabs or line breaks inside), as a browser would read it:
  `redirect(next)` after a sign-in, with `?next=javascript:...`, would have run as the
  page. Any other URL, to another host too (`//evil.com`), is sent; keep `next` to your
  own paths with [local_path](/docs/reference/local_path/).

```quillo
print(redirect("next").headers, redirect("").headers)
print(redirect(`/login?next=${url_encode("/orders?page=2")}`).headers)
print(redirect("/x") == redirect("/x"))
print(redirect("/a b/é").headers, redirect("https://bücher.de/").headers)
print(redirect("/\\evil.com").headers, redirect("/p/../../admin").headers)
```

```output
{ location: "next" } { location: "" }
{ location: "/login?next=%2Forders%3Fpage%3D2" }
false
{ location: "/a%20b/%C3%A9" } { location: "https://xn--bcher-kva.de/" }
{ location: "/%5Cevil.com" } { location: "/admin" }
```

### Errors

A status other than 301, 302, 303, 307 and 308 is a runtime error, as is a URL with a
line break, a tab or another control character (text from a request cannot add headers
of its own), a `javascript:`, `vbscript:` or `data:` URL, or a URL that is not a
string. None of these is an error value; the refusal names the scheme it was given. A
host IDNA cannot write (`https://ü%.com/`) gives an error value, which a route answers
with a 500.

```quillo error
print(redirect("/", 200))
```

```output
line 1: `redirect` status is 301, 302, 303, 307 or 308, got 200
```

```quillo error
print(redirect("/a\nb"))
```

```output
line 1: `redirect` URL cannot contain line breaks, tabs or other control characters
```

```quillo error
print(redirect("JavaScript:alert(1)"))
```

```output
line 1: `redirect` is not given a javascript: URL
```

```quillo error
print(redirect("data:text/html,<script>alert(1)</script>"))
```

```output
line 1: `redirect` is not given a data: URL
```

### Chaining

A redirect ends a request from inside a helper with `reply`: `reply 303 redirect(url)`
sends it from wherever the helper is called, so one `me_or_login` serves every page
that needs a visitor (see [Requiring a session](/docs/headers-cookies-sessions/#sessions)).

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
