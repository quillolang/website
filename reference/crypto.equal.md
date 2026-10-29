# crypto.equal
crypto.equal(str, str) -> bool
group: Crypto

### What it does

Whether two strings are the same, taking the same time whether they differ in the first
character or the last. `==` stops at the first difference, and the time it takes can
tell an attacker how much of a guess was right; so a secret that came from outside (an
API key, a webhook signature, a token in a link) is compared with this.

### Examples

```quillo
print(crypto.equal("abc", "abc"), crypto.equal("abc", "abd"))
let tag = crypto.hmac("secret", "payload")
print(crypto.equal(tag, crypto.hmac("secret", "payload")))
```

```output
true false
true
```

```quillo noexec
route POST /hooks/pay {
    let expected = crypto.hmac(env("HOOK_SECRET"), request.body)
    if !crypto.equal(request.headers["x-signature"] ?? "", expected) { reply 401 "bad signature" }
    ...
}
```

### Edge cases

- Strings of different lengths are not equal, and the answer is as prompt as any other.
- Two empty strings are equal.
- Case counts: `"ABC"` and `"abc"` differ.
- Only strings compare; a header that may be missing is given a default (`?? ""`)
  first.

```quillo
print(crypto.equal("a", "ab"), crypto.equal("", ""))
print(crypto.equal("ABC", "abc"))
print(crypto.equal(null ?? "", "x"))
```

```output
false true
false
false
```

### Errors

An argument that is not a string, `null` included, is a runtime error, not an error
value.

```quillo error
print(crypto.equal("a", 1))
```

```output
line 1: `crypto.equal` expects a str as argument 2, got int
```

### Chaining

The first string pipes in; the result is a bool for `if`.

```quillo
print("secret-key" | crypto.equal("secret-key"))
print(["k1", "k2"] | filter((k) => crypto.equal(k, "k2")))
```

```output
true
["k2"]
```

### See also

[crypto.hmac](/docs/reference/crypto.hmac/), [crypto.verify_password](/docs/reference/crypto.verify_password/), [crypto.token](/docs/reference/crypto.token/), [crypto.sha256](/docs/reference/crypto.sha256/)
