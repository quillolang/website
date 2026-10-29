# int
int(any) -> int | error(str)
group: General

### What it does

The value as an int. Text is parsed (a sign and digits, with spaces around them
allowed); a float is truncated toward zero; a decimal is truncated the same way; a
boolean is 1 or 0; an int is itself. What cannot be an int is an error value, not a
runtime error, so the result can be checked with `is_err` or given a default with `??`.

### Examples

```quillo
print(int("42"), int(" -7 "), int(3.99), int(-3.99))
print(int(dec("12.50")), int(true), int(false))
```

```output
42 -7 3 -3
12 1 0
```

### Edge cases

- Text with a decimal point is not an int: `int("3.0")` is an error; convert with
  `float` first when that is wanted.
- A float past what an int holds (about 9.2 × 10¹⁸) is clamped to the largest or
  smallest int, not an error; `NaN` is an error.
- `null` is an error, not 0: give the default yourself with `??`.
- Digits in other scripts are not read; only ASCII `0` to `9`.

```quillo
print(int("3.0"), int(float("3.0")))
print(int(1e30), int(-1e30), int(float("nan")))
print(int(null))
print(int(null) ?? 0)
```

```output
err("not an int: \"3.0\"") 3
9223372036854775807 -9223372036854775808 err("cannot convert float to int")
err("cannot convert null to int")
0
```

### Errors

The error value says what was given. In a route, `?` turns it into the request's
answer, and `?? reply 400 ...` into a 400 of your own.

```quillo
let n = int("x")
print(is_err(n), n.error)
```

```output
true not an int: "x"
```

```quillo noexec
route GET /items ? { page: str = "1" } {
    let p = int(page) ?? reply 400 "page must be a number"
    items(p)
}
```

### Chaining

```quillo
print("1,2,3" | split(",") | map(int) | sum)
print(["7", "x", "9"] | map(int) | filter((v) => !is_err(v)))
```

```output
6
[7, 9]
```

### See also

[float](/docs/reference/float/), [dec](/docs/reference/dec/), [str](/docs/reference/str/), [is_err](/docs/reference/is_err/), [round](/docs/reference/round/)
