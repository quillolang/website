# json.parse
json.parse(str) -> any
group: JSON

### What it does

The value written in a JSON text: an object becomes a map, an array a list, a string
a str, `true` and `false` booleans, `null` null. A number becomes an int when it is
whole and fits in 64 bits, otherwise a float. Text that is not JSON gives an error
value, not a runtime error, so it can be checked with `is_err` or given a default
with `??`.

### Examples

```quillo
let v = json.parse(`{"name": "Ann", "tags": ["a", "b"], "n": 3, "ok": true, "x": null}`)
print(v, type_of(v))
print(v.name, v.tags[0], v.n + 1)
print(json.parse("42"), json.parse(`"hi"`), json.parse("[1, 2]"), json.parse("null"))
```

```output
{ name: "Ann", tags: ["a", "b"], n: 3, ok: true, x: null } map
Ann a 4
42 hi [1, 2] null
```

### Edge cases

- A number with a point or an exponent is a float even when it is whole: `3.0` and
  `1e3` are floats, `3` is an int.
- No decimals are made: `12.50` becomes the float `12.5`. Keep amounts as strings in
  JSON and convert with `dec`.
- An int past 64 bits becomes a float, and loses digits; a number past what a float
  holds (`1e400`) is an error.
- A key given twice keeps the last value. Keys keep the order they were written in.
- Only one value: text after it is an error, but spaces around it are fine.
- Any valid JSON value is accepted at the top, not only an object or an array.

```quillo
print(json.parse("3.0"), type_of(json.parse("3.0")), json.parse("1e3"), json.parse("3"))
print(json.parse("12.50"), dec(json.parse(`{"amount": "12.50"}`).amount))
print(json.parse("9223372036854775807"), json.parse("9223372036854775808"), json.parse("1e400"))
print(json.parse(`{"a": 1, "a": 2}`), json.parse(`{"b": 1, "a": 2}`) | keys)
print(json.parse("  [1]  "), json.parse("1 2"))
```

```output
3.0 float 1000.0 3
12.5 12.50
9223372036854775807 9223372036854776000 err("invalid JSON: number out of range at line 1 column 5")
{ a: 2 } ["b", "a"]
[1] err("invalid JSON: trailing characters at line 1 column 3")
```

### Errors

Bad JSON is an error value whose payload says what went wrong and where. An argument
that is not a string (`null` included) is a runtime error, not an error value: a
request body or a file that may be missing needs `?? ""` first.

```quillo
let v = json.parse("{bad")
print(is_err(v), v.error)
print(json.parse("[1,]"), json.parse(""), json.parse("{'a': 1}"))
print(json.parse("x") ?? {})
```

```output
true invalid JSON: key must be a string at line 1 column 2
err("invalid JSON: trailing comma at line 1 column 4") err("invalid JSON: EOF while parsing a value at line 1 column 0") err("invalid JSON: key must be a string at line 1 column 2")
{}
```

```quillo error
print(json.parse(null))
```

```output
line 1: `json.parse` expects a str as argument 1, got null
```

### Chaining

In a pipeline the text comes first; `?` passes a parse error on from a function, and
`unwrap` stops on one:

```quillo
print(`{"a": 1}` | json.parse | get("a"))
fn total(body: str) -> int ! str = json.parse(body)? | sum
print(total("[1, 2, 3]"), total("nope"))
```

```output
1
6 err("invalid JSON: expected ident at line 1 column 2")
```

### See also

[json.stringify](/docs/reference/json.stringify/), [is_err](/docs/reference/is_err/), [unwrap](/docs/reference/unwrap/), [dec](/docs/reference/dec/), [get](/docs/reference/get/)
