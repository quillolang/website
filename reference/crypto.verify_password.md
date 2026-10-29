# crypto.verify_password
crypto.verify_password(str, str | null) -> bool
group: Crypto

### What it does

Whether a password matches a hash made by
[crypto.hash_password](/docs/reference/crypto.hash_password/): the password first, the
hash second. False for a wrong password, and false for anything that is not such a hash,
`null` included, so a user with no hash stored never gets in. It takes as long either
way (a stand-in hash is checked when there is none), so an unknown email answers no
sooner than a known one with a wrong password.

### Examples

```quillo
let h = crypto.hash_password("hunter2")
print(crypto.verify_password("hunter2", h))
print(crypto.verify_password("Hunter2", h))
```

```output
true
false
```

```quillo noexec
route POST /login { form: { email: str, password: str } } {
    let user = db.one("select * from users where email = ?", email)
    if !crypto.verify_password(password, user.password_hash) { reply 401 "Wrong email or password" }
    set_session({ user: user.id })
    redirect("/")
}
```

### Edge cases

- `null` as the hash is false, not an error: `user.password_hash` of a user that was
  not found (null) can be given as it is.
- Text that is not an Argon2id hash (an empty string, a SHA-256 from another system)
  is false.
- The check is exact: case and spaces in the password count.
- The hash's own salt is read from the hash, so nothing else needs storing.

```quillo
print(crypto.verify_password("hunter2", null))
print(crypto.verify_password("hunter2", ""), crypto.verify_password("hunter2", crypto.sha256("hunter2")))
print(crypto.verify_password("hunter2 ", crypto.hash_password("hunter2")))
```

```output
false
false false
false
```

### Errors

A password that is not a string is a runtime error, not an error value; a hash that is
anything but a string or null is treated as no hash, and gives false.

```quillo error
print(crypto.verify_password(null, "x"))
```

```output
line 1: `crypto.verify_password` expects a str as argument 1, got null
```

```quillo
print(crypto.verify_password("hunter2", 42))
```

```output
false
```

### Chaining

The password comes first, so it pipes in: `password | crypto.verify_password(hash)`.
The result is a bool, for `if` or `!`.

```quillo
let h = crypto.hash_password("hunter2")
print("hunter2" | crypto.verify_password(h))
print(["hunter2", "nope"] | map((p) => crypto.verify_password(p, h)))
```

```output
true
[true, false]
```

### See also

[crypto.hash_password](/docs/reference/crypto.hash_password/), [crypto.equal](/docs/reference/crypto.equal/), [set_session](/docs/reference/set_session/), [session](/docs/reference/session/)
