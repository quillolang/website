# crypto.sha256
crypto.sha256(str) -> str
group: Crypto

### What it does

The SHA-256 hash of the text, as 64 lower-case hex characters. The text is hashed as
its UTF-8 bytes. The same text gives the same hash on every machine and every run, so
it is for fingerprints, content addresses and checksums; for passwords use
[crypto.hash_password](/docs/reference/crypto.hash_password/), which is salted and slow on
purpose.

### Examples

```quillo
print(crypto.sha256("hello"))
print(crypto.sha256("The quick brown fox jumps over the lazy dog"))
```

```output
2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592
```

### Edge cases

- The empty string has a hash too, the well-known `e3b0c442...`.
- The result is always 64 characters, whatever the text's length.
- Letters outside ASCII hash as their UTF-8 bytes: `"héllo"` and `"hello"` differ.
- A value that is not text is hashed through its JSON: `crypto.sha256(json.stringify(v))`.

```quillo
print(crypto.sha256(""))
print(len(crypto.sha256("x")), len(crypto.sha256(repeat("x", 100000))))
print(crypto.sha256("héllo") == crypto.sha256("hello"))
print(crypto.sha256(json.stringify({ id: 7, tags: ["a"] })))
```

```output
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
64 64
false
55f8a22c6c474bbfffb93b5637ac1035665decc79b0f12f9a1b0f2969119346d
```

### Errors

An argument that is not a string is a runtime error, not an error value: `null` and
numbers included. Convert with `str` or `json.stringify` first.

```quillo error
print(crypto.sha256(42))
```

```output
line 1: `crypto.sha256` expects a str as argument 1, got int
```

```quillo error
print(crypto.sha256(null))
```

```output
line 1: `crypto.sha256` expects a str as argument 1, got null
```

### Chaining

The text is the only argument, so it reads well at the end of a pipeline, and the hex
string can be cut with `slice` for a short id.

```quillo
print("hello" | crypto.sha256)
print("hello" | crypto.sha256 | slice(0, 12))
print(["a", "b"] | map(crypto.sha256) | map((h) => slice(h, 0, 8)))
```

```output
2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
2cf24dba5fb0
["ca978112", "3e23e816"]
```

### See also

[crypto.hmac](/docs/reference/crypto.hmac/), [crypto.hash_password](/docs/reference/crypto.hash_password/), [crypto.equal](/docs/reference/crypto.equal/), [json.stringify](/docs/reference/json.stringify/), [slice](/docs/reference/slice/)
