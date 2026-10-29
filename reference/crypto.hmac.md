# crypto.hmac
crypto.hmac(str, str) -> str
group: Crypto

### What it does

The HMAC-SHA256 of a message under a key, as 64 lower-case hex characters: the key
first, the message second. Whoever knows the key can make the same tag and check it,
and nobody else can; that is how a signed cookie, a webhook's signature or a reset link
is checked. Compare a tag that came from outside with
[crypto.equal](/docs/reference/crypto.equal/), in constant time.

### Examples

```quillo
print(crypto.hmac("key", "The quick brown fox jumps over the lazy dog"))
let tag = crypto.hmac("secret", "user=7&expires=1900000000")
print(tag)
print(crypto.equal(tag, crypto.hmac("secret", "user=7&expires=1900000000")))
```

```output
f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8
08e8db197ec52faefa8b59f1619591cd5a7897bf1899f12733d9536315804fbf
true
```

### Edge cases

- The key and the message are not interchangeable: `hmac("a", "b")` and
  `hmac("b", "a")` differ.
- An empty key and an empty message are allowed and give a tag like any other; a long
  key works too (it is hashed first, as HMAC does).
- The result is always 64 characters.
- A different key or one changed character in the message gives an unrelated tag.

```quillo
print(crypto.hmac("a", "b") == crypto.hmac("b", "a"))
print(crypto.hmac("", ""))
print(len(crypto.hmac(repeat("k", 1000), "m")))
print(crypto.hmac("secret", "user=7") == crypto.hmac("secret", "user=8"))
```

```output
false
b613679a0814d9ec772f95d778c35fc5ff1697c493715653c6c712144292c5ad
64
false
```

### Errors

A key or a message that is not a string is a runtime error, not an error value;
leaving the message out is one too.

```quillo error
print(crypto.hmac("key"))
```

```output
line 1: `crypto.hmac` expects a str as argument 2, got nothing
```

```quillo error
print(crypto.hmac(123, "message"))
```

```output
line 1: `crypto.hmac` expects a str as argument 1, got int
```

### Chaining

In a pipeline the piped value becomes the first argument, the key: `msg |
crypto.hmac(key)` signs `key` under `msg`, which is not what is wanted. Write the call
out, or pipe the key on purpose.

```quillo
print(("message" | crypto.hmac("key")) == crypto.hmac("message", "key"))
print(crypto.hmac(env("SIGNING_KEY") ?? "dev", "order:42") | slice(0, 16))
```

```output
true
dcf53914470ce8a9
```

### See also

[crypto.sha256](/docs/reference/crypto.sha256/), [crypto.equal](/docs/reference/crypto.equal/), [crypto.token](/docs/reference/crypto.token/), [env](/docs/reference/env/)
