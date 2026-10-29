# err
err(any=) -> error(any)
group: Records and errors

### What it does

An error value carrying a payload: text, a number, a map, anything. An error value is
a value, not a stop: it can be stored, printed, returned, compared, checked with
`is_err`, read with `.error`, replaced with `??` or passed on from a function with
`?`. Builtins such as `int("x")` and `json.parse` return error values made this way.
Without an argument the payload is `null`.

### Examples

```quillo
let e = err("no such user")
print(e, type_of(e), e.error)
fn find(id: int) -> map ! str = if id == 1 { { id: 1, name: "Ann" } } else { err(`no user ${id}`) }
print(find(1), find(2))
print(find(2) ?? { name: "anon" })
```

```output
err("no such user") error no such user
{ id: 1, name: "Ann" } err("no user 2")
{ name: "anon" }
```

### Edge cases

- The payload can be a map, so an error can carry a code and a message.
- `err()` is `err(null)`.
- Two errors are equal when their payloads are.
- `??` sees an error value as it sees `null`; `0`, `false` and `""` are not replaced.
- An error wrapped in `err` again is an error whose payload is an error.

```quillo
let e = err({ code: 404, msg: "gone" })
print(e.error.code, e.error.msg)
print(err(), err("x") == err("x"), err("x") == err("y"))
print(err("x") ?? "fallback", 0 ?? "fallback")
print(err(err("inner")).error)
```

```output
404 gone
err(null) true false
fallback 0
err("inner")
```

### Errors

`err` itself never fails. Using an error value as if it were its payload is a
runtime error: adding to one, indexing it, calling it. A function whose signature
declares `! str` and returns an error with another payload is a runtime error too,
and `quillo check` reports it before the program runs.

```quillo error
print(err("x") + 1)
```

```output
line 1: cannot add error and int
```

### Chaining

With `?` the error of a call ends the function with that error; with `??` it becomes
a default. `match` can take an error apart:

```quillo
fn parse_age(s: str) -> int ! str = match int(s) { int as n if n >= 0 => n, _ => err(`bad age: ${s}`) }
fn next_year(s: str) -> int ! str = parse_age(s)? + 1
print(next_year("41"), next_year("x"))
print(match int("x") { error as e => `failed: ${e.error}`, _ => "ok" })
```

```output
42 err("bad age: x")
failed: not an int: "x"
```

### See also

[is_err](/docs/reference/is_err/), [unwrap](/docs/reference/unwrap/), [int](/docs/reference/int/), [json.parse](/docs/reference/json.parse/)
