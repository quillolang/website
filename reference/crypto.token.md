# crypto.token
crypto.token(int=) -> str
group: Crypto

### What it does

A random token from the operating system's random source, for session ids, API keys,
reset links and secrets: that many random bytes (32 unless given, from 1 to 1,024)
written in base64url, so it is safe in a URL, a cookie and a header without encoding.
32 bytes give 43 characters. It needs the `random` effect.

### Examples

```quillo
let t = crypto.token()
print(len(t), re.test(t, "^[A-Za-z0-9_-]+$"))
print(len(crypto.token(16)), len(crypto.token(64)))
```

```output
43 true
22 86
```

### Edge cases

- Two tokens are never the same: the value differs on every call and every run.
- The length in characters is the bytes times four thirds, rounded up, with no `=`
  padding: 1 byte gives 2 characters, 1,024 give 1,366.
- `null` as the argument is the default, 32 bytes.
- The characters are letters, digits, `-` and `_` only: nothing to escape.

```quillo
print(crypto.token() == crypto.token())
print(len(crypto.token(1)), len(crypto.token(1024)))
print(len(crypto.token(null)))
print(crypto.token(9) | re.test("^[A-Za-z0-9_-]{12}$"))
```

```output
false
2 1366
43
true
```

### Errors

A size outside 1 to 1,024, or one that is not an int, is a runtime error, not an error
value.

```quillo error
print(crypto.token(0))
```

```output
line 1: `crypto.token` takes a number of bytes from 1 to 1024, got 0
```

```quillo error
print(crypto.token("32"))
```

```output
line 1: `crypto.token` takes a number of bytes from 1 to 1024, got "32"
```

### Chaining

The size is its only argument, so it is called plainly and its result piped on: into a
`slice` for a shorter code, or stored beside its hash so the database never holds the
secret itself.

```quillo
let key = crypto.token()
print(len(key), len(crypto.sha256(key)))
print(crypto.token(6) | len)
```

```output
43 64
8
```

### See also

[crypto.hash_password](/docs/reference/crypto.hash_password/), [crypto.sha256](/docs/reference/crypto.sha256/), [crypto.equal](/docs/reference/crypto.equal/), [uuid](/docs/reference/uuid/), [random](/docs/reference/random/)
