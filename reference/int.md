# int
int(any) -> int | error(str)
group: General

### What it does

The value as an int. Text is digits after an optional `+` or `-`, with leading zeros
and white space at either end taken (`int(" 5")`, `int("+2")` and `int("02")` are 5, 2
and 2); a float is truncated toward zero; a decimal is truncated the same way; a
boolean is 1 or 0; an int is itself. What cannot be an int is an error value, not a
runtime error, so the result can be checked with `is_err` or given a default with `??`.

### Examples

```quillo
print(int("42"), int(" -7 "), int("+2"), int("02"), int(3.99), int(-3.99))
print(int(dec("12.50")), int(true), int(false))
```

```output
42 -7 2 2 3 -3
12 1 0
```

### Edge cases

- Text with a decimal point is not an int: `int("3.0")` is an error; convert with
  `float` first when that is wanted. `"1e3"`, `"0x0A"`, `"1_000"` and `""` are errors
  too, in the browser as on the server.
- It is looser than a route's `int`: `:id(int)`, and a typed field of a query or a
  form, take an optional `-` and digits with no leading `0` (`05`, `+5` and ` 5` are not
  one), so a page has one address. A field taken as `str` and checked by hand takes the
  pattern's rule with `re.test(s, "^(0|-?[1-9][0-9]*)$")` before `int(s)`.
- A float past what an int holds (about 9.2 × 10¹⁸) is an error value, as `NaN` is, and
  as a decimal that large is.
- `null` is an error, not 0: give the default yourself with `??`.
- Digits in other scripts are not read; only ASCII `0` to `9`.

```quillo
print(int("3.0"), int(float("3.0")))
print(int("1e3"), int(""), re.test("05", "^(0|-?[1-9][0-9]*)$"), int("05"))
print(int(1e30), int(-1e30), int(float("nan")))
print(int(null))
print(int(null) ?? 0)
```

```output
err("not an int: \"3.0\"") 3
err("not an int: \"1e3\"") err("not an int: \"\"") false 5
err("1000000000000000000000000000000 is too large for an int") err("-1000000000000000000000000000000 is too large for an int") err("cannot convert float to int")
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
