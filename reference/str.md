# str
str(any=) -> str
group: General

### What it does

The value as text, written the way `print` writes it: a string is itself, a number its
digits, a whole float with `.0` and never in exponent form, a decimal its digits, a
boolean `true` or `false`, `null` the word `null`, and a list or map as Quillo writes
it, strings inside them quoted. It never fails, so it is the safe way to put anything
into a template or a message.

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
- A string is given back unchanged, and `str()` without an argument is `"null"`.

```quillo
print(str(1e16), str(0.1 + 0.2), str(-0.0), str(1e-7))
print(str(err("boom")), type_of(str(err("boom"))))
print(str("already"), str())
```

```output
10000000000000000 0.30000000000000004 -0.0 0.0000001
err("boom") str
already null
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
