# unwrap
unwrap(any) -> any
group: Records and errors

### What it does

The value itself when it is not an error value, and a runtime error when it is. It
turns an error value into a stop: the request fails with a 500 and the error's
payload in the message. Use it where an error cannot happen in practice and a silent
default would hide a bug; use `??` for a default and `?` to pass the error on.

### Examples

```quillo
print(unwrap(int("42")), unwrap("a"), unwrap([1, 2]))
let config = unwrap(json.parse(`{"port": 8080}`))
print(config.port)
```

```output
42 a [1, 2]
8080
```

### Edge cases

- `null` is not an error: `unwrap(null)` is `null`.
- The payload goes into the message as text: a map payload shows as a map, a `null`
  payload as `null`.
- `??` after `unwrap` comes too late: the runtime error has already stopped the
  program. Put `??` on the value instead.

```quillo
print(unwrap(null), unwrap(false))
print(int("x") ?? 0)
```

```output
null false
0
```

### Errors

An error value is a runtime error, not an error value: the message is `unwrap of an
error:` and the payload.

```quillo error
print(unwrap(err("missing")))
```

```output
line 1: unwrap of an error: missing
```

```quillo error
print(unwrap(err({ code: 404 })) ?? 0)
```

```output
line 1: unwrap of an error: { code: 404 }
```

### Chaining

```quillo
print(["1", "2"] | map(int) | map(unwrap))
print(`[1, 2]` | json.parse | unwrap | sum)
```

```output
[1, 2]
3
```

### See also

[err](/docs/reference/err/), [is_err](/docs/reference/is_err/), [int](/docs/reference/int/), [json.parse](/docs/reference/json.parse/)
