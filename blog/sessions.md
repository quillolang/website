---
title: Sessions that cannot be forged
date: 2025-08-17
summary: Signing in should take three lines and be safe by default. Signed cookies, the right flags and a short list of rules can be the language's job.
tags: design, security
---
Sessions are where web frameworks hand the most decisions to the programmer: where to keep them, how to sign them, which cookie flags to set, how long they last. Each choice has a safe answer most of the time, and most of the trouble comes from not knowing it.

### Three calls

```quillo
route POST /login { form: { email: str, password: str } } {
    let user = db.one("select * from users where email = ?", email)
    if !crypto.verify_password(password, user.password_hash) { reply 401 "Wrong email or password" }
    set_session({ user: user.id })
    redirect("/")
}

route POST /logout { end_session(); redirect("/") }
```

`set_session`, `session()` and `end_session()`. That is the whole interface.

### Safe defaults, made by the runtime

- **Signed, not encrypted.** The session is a cookie signed with HMAC-SHA256: the browser can read it but not change it. So it holds an id, and the rest stays in the database.
- **The signature covers more than the data:** its expiry, so an old cookie is no session, and the program it belongs to.
- **The strictest cookie the browser allows.** In production, `HttpOnly`, `Secure` and a `__Host-` name, which a sibling subdomain cannot set.
- **One secret, set once.** `QUILLO_SECRET`, the same on every server, or sessions end at each restart.

### What it leaves to you

Ending a session everywhere (a stolen laptop) needs the server to remember which sessions exist. The runtime cannot know your rules for that, so the guide shows how: keep an id in the session and check it against the database.

> **Since then:** sessions work this way in Quillo. See [Cookies and sessions](/docs/routes/#cookies-and-sessions).
