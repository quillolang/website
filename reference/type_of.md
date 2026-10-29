# type_of
type_of(any) -> str
group: General

### What it does

The kind of a value as text: one of `null`, `bool`, `int`, `float`, `dec`, `str`,
`list`, `map`, `fn`, `html`, `response` and `error`. In the browser a JavaScript
Promise is `promise`. It is the way to tell an int from a float, a decimal from a
float, and an error value from anything else.

### Examples

```quillo
print(type_of(null), type_of(true), type_of(1), type_of(1.0), type_of(dec("1")), type_of("s"))
print(type_of([]), type_of({}), type_of((x) => x), type_of(<p/>), type_of(err("x")))
```

```output
null bool int float dec str
list map fn html error
```

### Edge cases

- Arithmetic tells: `1 / 2` is a `float`, `4 / 2` an `int`, `1 + 1.0` a `float`, a
  decimal plus an int a `dec`.
- A builtin is `fn`, like a lambda; a `redirect` or `respond` value is `response`.
- An error value is `error`, and `type_of(x) == "error"` tells it apart where
  `is_err` is not wanted.
- JSON gives the kinds its values have: a whole number is `int`, one with a point
  `float`.

```quillo
print(type_of(1 / 2), type_of(4 / 2), type_of(1 + 1.0), type_of(dec("1") + 1))
print(type_of(upper), type_of(redirect("/")), type_of(float("x")))
print(json.parse("[1, 2.5, \"s\", null, true, {}]") | map(type_of))
```

```output
float int float dec
fn response error
["int", "float", "str", "null", "bool", "map"]
```

### Errors

`type_of` never fails: every value has a kind, `null` included, and no argument at all
is `null`.

```quillo
print(type_of(), type_of(type_of))
```

```output
null fn
```

### Chaining

```quillo
print(42 | type_of)
print([1, "a", null, 2.5] | map(type_of) | unique)
print(["1", 2, "3"] | filter((v) => type_of(v) == "str"))
```

```output
int
["int", "str", "null", "float"]
["1", "3"]
```

### See also

[is_err](/docs/reference/is_err/), [int](/docs/reference/int/), [float](/docs/reference/float/), [str](/docs/reference/str/), [len](/docs/reference/len/)
