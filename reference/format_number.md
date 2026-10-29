# format_number
format_number(num | dec, str | null=, int=) -> str
group: General

### What it does

A number as a locale writes it: grouped digits, the locale's decimal mark and its
minus sign. `format_number(x, locale, digits)` rounds to `digits` decimals first, half
to even, and writes exactly that many; without `digits` the number's own decimals are
written. The locale is a tag like `"en-US"` or `"de-DE"`; `null` or left out, the
request's locale is used, `en-US` in a plain program. A locale that is not in the
table is written as the first of its language (`de-LU` as de-DE, `de` as de-DE), and
an unknown language as en-US.

### Examples

```quillo
print(format_number(1234567.5, "en-IN", 2))
print(format_number(1234.5, "en-US"), format_number(1234.5, "de-DE"), format_number(1234.5, "fr-FR"), format_number(1234.5, "de-CH"))
print(format_number(dec("1234.5678"), "en-US", 2), format_number(-1234.5, "de-DE", 1))
```

```output
12,34,567.50
1,234.5 1.234,5 1 234,5 1’234.5
1,234.57 -1.234,5
```

### Edge cases

- Rounding is half to even: `2.5` to 0 digits is `2`, `3.5` is `4`, and `1.005` to 2
  digits is `1.00`.
- `digits` is kept within 0 to 28: a larger count writes 28 decimals, a negative one
  none.
- An int is written without decimals unless `digits` says otherwise; `0` with 2 digits
  is `0.00`.
- A float too large for a decimal (past about 7.9e28), `NaN` or an infinity is written
  plainly, without grouping.
- `null` as the locale means the request's locale, `en-US` here; `"de"` is de-DE,
  `"xx-YY"` is en-US.

```quillo
print(format_number(2.5, "en-US", 0), format_number(3.5, "en-US", 0), format_number(1.005, "en-US", 2))
print(format_number(1.5, "en-US", 40), format_number(1.5, "en-US", -3))
print(format_number(1234, "en-US"), format_number(0, "en-US", 2))
print(format_number(1e30, "en-US"), format_number(float("nan"), "en-US"), format_number(float("inf"), "de-DE"))
print(format_number(1234.5, null, 1), format_number(1234.5, "de"), format_number(1234.5, "xx-YY"))
```

```output
2 4 1.00
1.5000000000000000000000000000 2
1,234 0.00
1000000000000000000000000000000 NaN inf
1,234.5 1.234,5 1,234.5
```

### Errors

A first argument that is not a number, a locale that is not a string or `null`, or a
digit count that is not an int, is a runtime error, not an error value. Text is parsed
first with [float](/docs/reference/float/) or [dec](/docs/reference/dec/).

```quillo error
print(format_number("1234", "en-US"))
```

```output
line 1: `format_number` expects a number as argument 1, got str "1234"
```

### Chaining

```quillo
print(1234.5 | format_number("de-DE", 2))
print([0.5, 1234.5678] | map((x) => format_number(x, "en-US", 1)) | join(" / "))
print(`Total: ${dec("1999.5") | format_number("fr-FR", 2)}`)
```

```output
1.234,50
0.5 / 1,234.6
Total: 1 999,50
```

### See also

[money.format](/docs/reference/money.format/), [round](/docs/reference/round/), [str](/docs/reference/str/), [dec](/docs/reference/dec/), [date.format](/docs/reference/date.format/)
