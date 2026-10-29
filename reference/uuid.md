# uuid
uuid() -> str
group: General

### What it does

A new version 4 UUID as text: 36 characters, lower-case hex in five groups of 8, 4, 4,
4 and 12, with a `4` at the start of the third group. Its bytes come from the operating
system, so it can serve as a session id, a token or a file name that cannot be guessed,
which [random](/docs/reference/random/) cannot.

### Examples

```quillo
let u = uuid()
print(type_of(u), len(u))
print(split(u, "-") | map(len))
print(re.test(u, "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"))
```

```output
str 36
[8, 4, 4, 4, 12]
true
```

### Edge cases

- Each call is a new id: a thousand in a row are a thousand different strings.
- Lower case: `u == lower(u)`; upper-case it for a display that wants that.
- Without its dashes it is 32 hex characters.
- `uuid()` takes no arguments; one given is ignored.

```quillo
print(range(1000) | map((i) => uuid()) | unique | len)
let u = uuid()
print(u == lower(u), len(replace(u, "-", "")), slice(u, 14, 15))
print(len(uuid(1)))
```

```output
1000
true 32 4
36
```

### Errors

`uuid` never gives an error value. It is a runtime error only when the operating system
gives no random bytes, which does not happen on a working machine.

```quillo
print(is_err(uuid()))
```

```output
false
```

### Chaining

`uuid` starts a pipeline rather than taking one, since it has no argument.

```quillo
print(uuid() | upper | len)
print(`photos/${uuid()}.jpg` | ends_with(".jpg"))
```

```output
36
true
```

```quillo noexec
server fn add_photo(file: map) = save_upload(file, `photos/${uuid()}.jpg`)
```

### See also

[random](/docs/reference/random/), [random_int](/docs/reference/random_int/), [crypto.token](/docs/reference/crypto.token/), [save_upload](/docs/reference/save_upload/)
