# float
float(any) -> float | error(str)
group: General

### What it does

The value as a float. Text is parsed (a sign, digits, a point, an exponent, with spaces
around them allowed); an int or a decimal becomes the nearest float; a float is itself.
What cannot be a float is an error value, not a runtime error, so the result can be
checked with `is_err` or given a default with `??`.

### Examples

```quillo
print(float("3.5"), float(" 2 "), float("1e3"), float("+2.5"))
print(float(3), float(dec("1.25")), float(1.5))
```

```output
3.5 2.0 1000.0 2.5
3.0 1.25 1.5
```

### Edge cases

- `nan`, `inf` and `-inf` are read as text: `float("nan")` is `NaN`, a float, not an
  error.
- Only ASCII digits and a point: a comma, a `_` between digits, hex and digits in other
  scripts are errors.
- The empty string and `null` are errors, not `0.0`: give the default with `??`.
- A boolean is an error too, unlike `int(true)`, which is 1.
- `float(1)` is `1.0`, with `type_of` `float`.

```quillo
print(float("nan"), float("inf"), float("-inf"))
print(float("3,5"), float("1_000"), float("0x10"))
print(float(""), float(null), float(true))
print(float(null) ?? 0.0, type_of(float(1)))
```

```output
NaN inf -inf
err("not a number: \"3,5\"") err("not a number: \"1_000\"") err("not a number: \"0x10\"")
err("not a number: \"\"") err("cannot convert null to float") err("cannot convert bool to float")
0.0 float
```

### Errors

The error value says what was given. `is_err` sees it, `?` passes it on, `??` replaces
it. A page that needs an int from text uses [int](/docs/reference/int/) instead.

```quillo
let x = float("x")
print(is_err(x), x.error, x ?? 0.0)
```

```output
true not a number: "x" 0.0
```

### Chaining

```quillo
print("1.5,2.5" | split(",") | map(float) | sum)
print(["1", "x", "2.5"] | map(float) | filter((v) => !is_err(v)))
```

```output
4.0
[1.0, 2.5]
```

### See also

[int](/docs/reference/int/), [dec](/docs/reference/dec/), [str](/docs/reference/str/), [is_err](/docs/reference/is_err/), [round](/docs/reference/round/)
