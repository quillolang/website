# str
str(any) -> str
group: General

### What it does

The value as text, written the way `print` writes it: a string is itself, a number its
digits, a whole float with `.0` and never in exponent form, a decimal its digits, a
boolean `true` or `false`, `null` the word `null`, and a list or map as Quillo writes
it, strings inside them quoted. It never fails, so it is the safe way to put anything
into a template or a message.

On a server, an error Quillo made reads `err("internal error")` here, and its text goes to the
log: it may hold an address with its password. `print` and `error(r)` have the text. In
a page in production the browser hides it the same way, in text, a template, markup or
an attribute, so a component made again in the browser shows no more than the server's
page did; an error the program wrote, a `server fn`'s and the page's own JavaScript's
are shown as they are.

### Examples

```quillo
print(str(42), str(2.0), str(dec("1.50")), str(true), str(null))
print(str([1, "x", null]), str({ a: 1, b: "x" }))
print(len(str(12345)))
```

```output
42 2.0 1.50 true null
[1, "x", null] { a: 1, b: "x" }
5
```

### Edge cases

- A float is written in full: `str(1e16)` is sixteen digits and a zero, not `1e16`.
- A float that is not exact shows its digits as they are: `str(0.1 + 0.2)` is
  `0.30000000000000004`.
- An error value is written as `err("...")`, with its payload; `type_of` of the result
  is `str`, so this is a way to show an error, not to unwrap it.
- A float is written by its shortest digits, a tie taking the even digit as
  JavaScript does: `1916218016406818.3`, which is held as `...818.25`, is written
  `1916218016406818.2`, on the server and in the browser.
- In a component's text a whole float is written `2`, on both sides, so the page the
  server sends is the one the browser makes; elsewhere it is `2.0`.
- Markup is its HTML, in the browser too: `str(<p class="x">hi</p>)` is
  `<p class="x">hi</p>`.
- A map's key of letters, digits and `_` in any script, not starting with a digit, is
  written bare (`{ é: 1, 日本: 2 }`), another quoted (`{ "a b": 3, "1a": 4 }`), on both
  sides, in the order the keys were set, keys that look like numbers included
  (`{ b: 1, "1": 2 }` is written `b` first in the browser too).
- A string is given back unchanged. `str()` with nothing to make text of is an error in
  `quillo check`: `missing argument `x` in call to `str`: str(x)` (since 0.7; it gave
  `"null"`).

```quillo
print(str(1e16), str(0.1 + 0.2), str(-0.0), str(1e-7))
print(str(err("boom")), type_of(str(err("boom"))))
print(str("already"), str(null))
print(str(1916218016406818.3), str({ é: 1, 日本: 2, "a b": 3, "1a": 4 }), str(<p class="x">hi</p>))
```

```output
10000000000000000 0.30000000000000004 -0.0 0.0000001
err("boom") str
already null
1916218016406818.2 { é: 1, 日本: 2, "a b": 3, "1a": 4 } <p class="x">hi</p>
```

### Errors

`str` is never a runtime error and never an error value: every value has a text form,
a function included. `NaN` and the infinities are `NaN`, `inf` and `-inf`.

```quillo
print(str(float("nan")), str(float("inf")), str(upper))
```

```output
NaN inf <builtin upper>
```

### Chaining

```quillo
print(123 | str | len)
print([1, 2, 3] | map(str) | join("-"))
print(2.5 | str | ends_with(".5"))
```

```output
3
1-2-3
true
```

### See also

[int](/docs/reference/int/), [float](/docs/reference/float/), [print](/docs/reference/print/), [format_number](/docs/reference/format_number/), [json.stringify](/docs/reference/json.stringify/)
