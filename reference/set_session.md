# set_session
set_session(map | null, map | null=) -> null
group: Cookies and sessions

### What it does

Replaces the visitor's session with the map and sends it to the browser as a cookie
signed with HMAC-SHA256: the browser can read it but not change it. It lasts 30 days
unless the option `max_age` says otherwise, in seconds or a duration (`"12h"`).
`set_session(null)` ends the session, as `end_session` does. It gives null. See
[Headers, cookies and sessions](/docs/guides/headers-cookies-sessions/#sessions).

### Examples

```quillo noexec
route POST /login { form: { email: str, password: str } } {
    let user = db.one("select * from users where email = ?", email)
    let hash = user.password_hash ?? crypto.hash_password("not anyone's")   // same work, user or not
    if user == null || !crypto.verify_password(password, hash) { reply 401 "Wrong email or password" }
    set_session({ user: user.id })
    redirect("/")
}

server fn sign_in(email: str, password: str) {
    let user = check_password(email, password) ?? return err("Wrong email or password")
    set_session({ user: user.id }, { max_age: "12h" })
    { name: user.name }
}
```

```quillo
print(set_session({ user: 7 }))
print(session())
```

```output
null
{ user: 7 }
```

### Edge cases

- The map replaces the session; it is not merged. To add a field, spread the old one:
  `set_session({ ...session(), at: now() })`.
- `max_age` is the only option. It must be more than 0 seconds; `"30d"` takes `s`,
  `m`, `h`, `d`, `w`, `y`.
- The signature covers the expiry, the tenant and the program's mount point, so the
  session is no session past its time, for another tenant or in another mounted
  program.
- The cookie holds the whole session as JSON, signed: keep an id in it and the rest
  in the database. Keep secrets out, since the browser can read it.
- A session set in a `server fn` is on the answer to that call, and the pages the
  visitor opens next carry it.
- Outside a request the call still signs the map and `session()` gives it back for
  the rest of the run, with a note on stderr when `QUILLO_SECRET` is not set.

```quillo
set_session({ user: 7, name: "Ann" })
set_session({ user: 7 })
print(session())
set_session({ ...session(), at: 1700000000000 }, { max_age: "30d" })
print(session())
set_session(null)
print(session())
```

```output
{ user: 7 }
{ user: 7, at: 1700000000000 }
{}
```

### Errors

A first argument that is not a map or null, a `max_age` that is not seconds or a
duration or is 0 or less, and options that are not a map are runtime errors, not
error values. So is a session over about 3,900 bytes once signed, more than a cookie
holds: keep an id in it and the rest in the database.

```quillo error
set_session("user 7")
```

```output
line 1: `set_session` expects a map, got str
```

```quillo error
set_session({ user: 7 }, { max_age: 0 })
```

```output
line 1: `set_session`'s max_age is seconds or a duration like "30d", got 0
```


### Chaining

A sliding session is `set_session` called again on the requests that count as use,
once a day, from a helper every such route calls:

```quillo noexec
fn touch() {
    let s = session()
    let day = 24 * 60 * 60 * 1000                      // now() is milliseconds
    if s.user != null && now() - (s.at ?? 0) > day {
        set_session({ ...s, at: now() }, { max_age: "30d" })
    }
}

route GET /dashboard { touch(); <Dashboard me={me_or_login("/dashboard")}/> }
```

### See also

[session](/docs/reference/session/), [end_session](/docs/reference/end_session/), [set_cookie](/docs/reference/set_cookie/), [crypto.verify_password](/docs/reference/crypto.verify_password/), [crypto.token](/docs/reference/crypto.token/)
