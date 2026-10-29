# url_encode
url_encode(any) -> str
group: Web

### What it does

The value's text written for a URL: every byte but letters, digits and `-_.~` becomes
`%XX`. A map gives a query string, `a=1&b=x%20y`, each key and value encoded, leaving
out keys whose value is null. It is `encodeURIComponent`, except that `!'()*` are
encoded too; the browser's `url_encode` gives the same.

### Examples

```quillo
print(url_encode("a b"))
print(url_encode("a&b=c/d?e#f"))
print(url_encode({ q: "a b", page: 2 }))
print(`/search?${url_encode({ q: "tea & cake" })}`)
```

```output
a%20b
a%26b%3Dc%2Fd%3Fe%23f
q=a%20b&page=2
/search?q=tea%20%26%20cake
```

### Edge cases

- A space is `%20`, not `+`; a `+` in the text is `%2B`.
- Text outside ASCII is encoded byte by byte as UTF-8.
- `!'()*` are encoded, unlike in JavaScript; `-_.~` are kept.
- In a map, a null value drops its key; `false` and `""` stay. Keys are encoded too.
  An empty map gives the empty string.
- A list or a map inside a map is its printed form, encoded; `null` on its own gives
  `null`.

```quillo
print(url_encode("a+b c"), url_encode("héllo"))
print(url_encode("!'()*"), url_encode("-_.~"))
print(url_encode({ q: "x", skip: null, n: 0, t: false, e: "" }))
print(url_encode({ "a b": "c&d" }), url_encode({}) == "")
print(url_encode([1, 2]), url_encode(null))
```

```output
a%2Bb%20c h%C3%A9llo
%21%27%28%29%2A -_.~
q=x&n=0&t=false&e=
a%20b=c%26d true
%5B1%2C%202%5D null
```

### Errors

None: every value has a text, so `url_encode` never fails and never gives an error
value. A number, a boolean or a decimal is its text.

```quillo
print(url_encode(42), url_encode(dec("1.50")), url_encode(true))
```

```output
42 1.50 true
```

### Chaining

```quillo
print("next page" | url_encode)
let next = "/items?page=2" | url_encode
print(`/login?next=${next}`)
```

```output
next%20page
/login?next=%2Fitems%3Fpage%3D2
```

```quillo noexec
fn signed_in(r) = session().user != null ? r : reply 303 redirect(`/login?next=${url_encode(r.path)}`)
```

### See also

[escape](/docs/reference/escape/), [redirect](/docs/reference/redirect/), [str](/docs/reference/str/)
