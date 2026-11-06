# json.stringify
json.stringify(any, any=) -> str
group: JSON

### What it does

The value as JSON text, on one line with no spaces. With a second argument that is
true, the text is indented by two spaces, one entry per line. A map becomes an
object with its keys in the order they were set (in the browser too, keys that look
like numbers included: `{ b: 1, "1": 2 }` is `{"b":1,"1":2}` on both sides), a list an
array, a decimal a string of its
digits so that nothing reading it rounds it. A route that answers a map writes the
same JSON.

### Examples

```quillo
let user = { name: "Ann", tags: ["a", "b"], n: 3, ok: true, x: null }
print(json.stringify(user))
print(json.stringify(user, true))
print(json.stringify([1, 2]), json.stringify("hi"), json.stringify(42), json.stringify(null))
```

```output
{"name":"Ann","tags":["a","b"],"n":3,"ok":true,"x":null}
{
  "name": "Ann",
  "tags": [
    "a",
    "b"
  ],
  "n": 3,
  "ok": true,
  "x": null
}
[1,2] "hi" 42 null
```

### Edge cases

- A whole float keeps its point: `2.0` is `2.0` (`-0.0` too), while the int `2` is
  `2`, so it reads back as a float, on the server and in the browser.
- A float turns to an exponent where JavaScript writes one: `1e21` is `1e+21` and
  `1e-7` is `1e-7`, while `1e20` is `100000000000000000000.0` and `0.000001` stays as
  it is, on both sides.
- A decimal is a string: `12.50m` is `"12.50"`. `NaN` and infinities are `null`.
- An error value is an object with one key, `error`, holding its payload. On a server,
  and in a page in production, an error Quillo made (a builtin's) is written
  `{"error":"internal error"}`, as `str` writes it, and its text goes to the log; an
  error the program wrote with `err` keeps its payload.
- Text is escaped as JSON needs; letters outside ASCII are written as they are.
- The second argument is read as truthy: `1` and `"yes"` indent, `false`, `null` and
  `0` do not. No other indent is available.
- A function has no JSON: a value holding one gives an error value naming where it is
  (below). An `html` value is written as its markup, in the browser too.
- Without an argument the text is `null`.

```quillo
print(json.stringify(2.0), json.stringify(2), json.stringify(0.1 + 0.2))
print(json.stringify(1e21), json.stringify(1e20), json.stringify(1e-7), json.stringify(0.000001), json.stringify(-0.0))
print(json.stringify(12.50m), json.stringify(float("nan")))
print(json.stringify(err("boom")), json.stringify(err({ code: 1 })))
print(json.stringify("quote \" and é"))
print(json.stringify({ a: 1 }, 1), json.stringify({ a: 1 }, 0))
print(json.stringify(raw("<b>")))
```

```output
2.0 2 0.30000000000000004
1e+21 100000000000000000000.0 1e-7 0.000001 -0.0
"12.50" null
{"error":"boom"} {"error":{"code":1}}
"quote \" and é"
{
  "a": 1
} {
  "a": 1
}
"<b>"
```

### Errors

A function anywhere in the value gives an error value naming its path, on both sides
(it was written as its text). So does a value whose JSON would pass
256 MiB or nest more than 10,000 deep. A route that answers a value holding a function
is a 500, with a log line naming the path. Note that a float past 2⁵³ written by it
and read by JavaScript loses digits; Quillo's own `json.parse` reads it back whole.

```quillo
print(json.stringify({ user: { name: "Ann", greet: (x) => x } }))
print(json.stringify([1, print]), json.stringify(print))
print(json.parse(json.stringify({ big: 9007199254740993 })))
```

```output
err("json.stringify: `user.greet` is a function, which cannot be written as JSON")
err("json.stringify: `[1]` is a function, which cannot be written as JSON") err("json.stringify: a function cannot be written as JSON")
{ big: 9007199254740993 }
```

### Chaining

```quillo
print({ a: 1 } | json.stringify | len)
print([1, 2] | json.stringify | json.parse)
print(crypto.sha256(json.stringify({ a: 1 })) | slice(0, 8))
```

```output
7
[1, 2]
015abd7f
```

### See also

[json.parse](/docs/reference/json.parse/), [str](/docs/reference/str/), [dec](/docs/reference/dec/), [err](/docs/reference/err/), [crypto.sha256](/docs/reference/crypto.sha256/)
