# is_err
is_err(any) -> bool
group: Records and errors

### What it does

Whether a value is an error value: `true` for anything made by `err` or returned as
an error by a builtin such as `int("x")`, `false` for everything else, `null`
included. It is the check to make before reading `.error`, which only an error value
has.

### Examples

```quillo
print(is_err(err("x")), is_err(int("x")))
print(is_err(1), is_err(null), is_err("err"), is_err(int("42")))
let n = int("x")
print(if is_err(n) { `failed: ${n.error}` } else { `ok: ${n}` })
```

```output
true true
false false false false
failed: not an int: "x"
```

### Edge cases

- The text `"err"` and a string that looks like a message are not errors.
- The payload of an error is not an error: `is_err(e.error)` is `false` unless the
  payload is an error itself.
- `err("x") ?? 1` is `1`, so the result of `??` is never an error.
- Without an argument the answer is `false`.

```quillo
print(is_err("err"), is_err(err("x").error), is_err(err(err("x")).error))
print(is_err(err("x") ?? 1))
```

```output
false false true
false
```

### Errors

`is_err` never fails. Reading `.error` on a value that is not an error is a runtime
error, which is what `is_err` is there to prevent.

```quillo error
let n = int("42")
print(n.error)
```

```output
line 2: int has no field `error`
```

### Chaining

As a predicate it goes straight into `filter`, `any` and `map`:

```quillo
let parsed = ["7", "x", "9"] | map(int)
print(parsed | filter(is_err))
print(parsed | filter((v) => !is_err(v)), parsed | any(is_err))
print(err("x") | is_err)
```

```output
[err("not an int: \"x\"")]
[7, 9] true
true
```

### See also

[err](/docs/reference/err/), [unwrap](/docs/reference/unwrap/), [int](/docs/reference/int/), [filter](/docs/reference/filter/), [any](/docs/reference/any/)
