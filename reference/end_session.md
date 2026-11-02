# end_session
end_session() -> null
group: Cookies and sessions

### What it does

Forgets the visitor's session: the session cookie is removed from the browser with the
request's answer, and `session()` is `{}` from here on. Logging out. It gives null.
`set_session(null)` does the same. See [Headers, cookies and
sessions](/docs/headers-cookies-sessions/#sessions).

### Examples

```quillo noexec
route POST /logout { end_session(); redirect("/") }

route GET / =
    <header>
        {session().user != null
            ? <form method="post" action="/logout"><button>Log out</button></form>
            : <a href="/login">Sign in</a>}
    </header>
```

Logging out is a form posting to the route, not a link: a `GET` would let any page log
the visitor out with an `<img>`, and a post from another site is refused with 403.
The answer carries `set-cookie: quillo_session=; Path=/; Max-Age=0` (in production the
name is `__Host-quillo_session`), and the page it redirects to shows `Sign in`.

```quillo
set_session({ user: 7 })
print(end_session())
print(session())
```

```output
null
{}
```

### Edge cases

- Ending a session that does not exist is fine: the cookie's removal goes out and
  `session()` stays `{}`.
- It removes the cookie from one browser. A copy someone kept stays valid until it
  expires: to sign out everywhere, keep a session id in the session and a table of
  live ids, delete from the table, then `end_session()`.
- Other cookies stay; `delete_cookie` removes those.
- A session set again later in the same request replaces the removal: the last
  `set_session` or `end_session` wins.

```quillo
print(end_session(), session())
end_session()
set_session({ user: 8 })
print(session())
```

```output
null {}
{ user: 8 }
```

### Errors

It takes no arguments and never fails.

```quillo
print(end_session() == null)
```

```output
true
```

### Chaining

It is a statement before the route's answer. Signing out everywhere:

```quillo noexec
route POST /logout/everywhere {
    let id = session().user ?? reply 401 "Log in first"
    db.exec("delete from sessions where user_id = ?", id)
    end_session()
    redirect("/")
}
```

### See also

[session](/docs/reference/session/), [set_session](/docs/reference/set_session/), [delete_cookie](/docs/reference/delete_cookie/), [redirect](/docs/reference/redirect/)
