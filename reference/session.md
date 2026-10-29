# session
session() -> map
group: Cookies and sessions

### What it does

The visitor's session: the map `set_session` stored, read from the signed cookie the
browser sent back, or `{}` when there is none. It works in any function the request
runs: a route, a `server fn` a component calls, a helper, a pipeline stage. Outside a
request (a job, a script) it is `{}`. See [Headers, cookies and
sessions](/docs/guides/headers-cookies-sessions/#sessions).

### Examples

```quillo noexec
route GET /me {
    let id = session().user ?? reply 401 "Log in first"
    db.one("select id, name from users where id = ?", id)
}

server fn save_note(text: str) {
    let id = session().user ?? return err("Sign in first")
    db.exec("insert into notes (user_id, text) values (?, ?)", id, text)
}
```

```quillo
print(session())
print(session().user)
print(session().user ?? "nobody")
```

```output
{}
null
nobody
```

### Edge cases

- No session is `{}`, never null, so a field of it is null and `??` gives the default
  without a check for null first.
- A session past its time, one signed for another tenant or another mounted program,
  or one whose signature does not match, is no session: `{}`. A request carrying two
  valid session cookies has no session either: one of them was planted.
- Reading it never renews it: a session ends when its time is up however often the
  visitor comes. Call `set_session` again on the requests that count as use.
- After `set_session` in the same run, `session()` gives the new map at once; after
  `end_session`, `{}` again.
- Inside a `live` loader it is the viewer's session, since the loader runs as a call
  from the page. `unwatched(() => session())` reads it without following anything.

```quillo
print(session() == {}, len(keys(session())))
set_session({ user: 7, role: "admin" })
print(session(), session().role)
end_session()
print(session())
```

```output
true 0
{ user: 7, role: "admin" } admin
{}
```

### Errors

`session()` takes no arguments and never fails: a missing, expired or forged cookie is
`{}`. Guarding a route is the program's own `??`:

```quillo
let id = session().user ?? "guest"
print(id)
```

```output
guest
```

```quillo noexec
fn me() = session().user == null ? null : db.one("select id, name from users where id = ?", session().user)
fn me_or_login(back: str) = me() ?? reply 303 redirect(`/login?next=${url_encode(back)}`)
```

### Chaining

The map is a value like any other: a field, a default, a lookup.

```quillo
set_session({ user: 7, roles: ["editor", "admin"] })
print(session().roles | map(upper))
print(session() | keys)
```

```output
["EDITOR", "ADMIN"]
["user", "roles"]
```

### See also

[set_session](/docs/reference/set_session/), [end_session](/docs/reference/end_session/), [cookie](/docs/reference/cookie/), [unwatched](/docs/reference/unwatched/)
