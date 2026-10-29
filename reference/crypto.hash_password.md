# crypto.hash_password
crypto.hash_password(str) -> str
group: Crypto

### What it does

A password's hash for storing, made with Argon2id and a fresh random salt: a string of
97 characters beginning `$argon2id$`, holding the parameters, the salt and the hash,
which [crypto.verify_password](/docs/reference/crypto.verify_password/) checks a password
against later. Hashing takes tens of milliseconds and 19 MiB on purpose, runs off the
event loop, and at most one per core at a time, so a flood of logins slows logins down
rather than taking the server's memory. It needs the `random` effect, for the salt.

### Examples

```quillo
let h = crypto.hash_password("hunter2")
print(slice(h, 0, 9), len(h))
print(crypto.verify_password("hunter2", h))
```

```output
$argon2id 97
true
```

```quillo noexec
route POST /signup { form: { email: str, password: str } } {
    db.exec("insert into users (email, password_hash) values (?, ?)", email, crypto.hash_password(password))
    redirect("/login")
}
```

### Edge cases

- The same password hashed twice gives two different strings, because each has its own
  salt; both verify.
- The empty password hashes and verifies like any other; refuse it yourself where it
  is not wanted.
- The hash is text, not a secret: it is stored as it is and never needs decoding.
- Over 1,024 hashes waiting their turn, the call is a runtime error (`too many
  passwords are being checked at once`) rather than a longer wait.

```quillo
let a = crypto.hash_password("hunter2")
let b = crypto.hash_password("hunter2")
print(a == b, crypto.verify_password("hunter2", a), crypto.verify_password("hunter2", b))
print(crypto.verify_password("", crypto.hash_password("")))
print(split(crypto.hash_password("x"), "$") | slice(0, 4))
```

```output
false true true
true
["", "argon2id", "v=19", "m=19456,t=2,p=1"]
```

### Errors

A password that is not a string (a number, `null` from a missing form field) is a
runtime error, not an error value.

```quillo error
print(crypto.hash_password(123))
```

```output
line 1: `crypto.hash_password` expects a str as argument 1, got int
```

### Chaining

The password is its only argument, so it pipes in, and the hash goes on to the
database. Compare with `verify_password`, never with `==`.

```quillo
print("hunter2" | crypto.hash_password | slice(0, 9))
let hashes = ["a", "b"] | map(crypto.hash_password)
print(crypto.verify_password("b", hashes[1]), crypto.verify_password("b", hashes[0]))
```

```output
$argon2id
true false
```

### See also

[crypto.verify_password](/docs/reference/crypto.verify_password/), [crypto.token](/docs/reference/crypto.token/), [crypto.sha256](/docs/reference/crypto.sha256/), [set_session](/docs/reference/set_session/)
