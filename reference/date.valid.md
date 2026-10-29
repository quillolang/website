# date.valid
date.valid(any, str | null=) -> bool
group: Dates

### What it does

Whether a value is text the `date` module accepts: a date `"YYYY-MM-DD"` that is a real
day, or a date-time `"YYYY-MM-DDTHH:MM:SS"` with an offset (`Z`, `+01:00`). With
`"date"` as the second argument only a date counts, with `"date-time"` only a date-time.
Any other value, `null` and numbers included, gives `false`; nothing here is an error.
Check text from a page with it before the arithmetic functions, which stop with a
runtime error on anything else; or give the field the type `date`, which refuses bad
text and date-times in a record, an annotation and a query.

### Examples

```quillo
print(date.valid("2026-10-27"), date.valid("2026-10-27T14:30:00Z"), date.valid("2026-02-30"))
print(date.valid("2026-10-27T14:30:00Z", "date"), date.valid("2026-10-27", "date-time"))
print(date.valid(42), date.valid(null), date.valid(""))
```

```output
true true false
false false
false false false
```

### Edge cases

- Only the exact form counts: `"27/10/2026"`, `"2026-1-5"`, a space before the text, a
  date-time with a space instead of `T`, without seconds or without an offset are all
  `false`, though `date.parse` reads some of them.
- The calendar is checked: `2024-02-29` is valid, `2023-02-29` is not.
- Years are 1 to 9999: `"0000-12-31"` is not a date.
- A fraction of a second and an offset with seconds are accepted in a date-time.
- `null` as the second argument is the same as leaving it out: either kind.

```quillo
print(date.valid("27/10/2026"), date.valid("2026-1-5"), date.valid(" 2026-10-27"))
print(date.valid("2026-10-27 14:30:00Z"), date.valid("2026-10-27T14:30Z"), date.valid("2026-10-27T14:30:00"))
print(date.valid("2024-02-29"), date.valid("2023-02-29"), date.valid("0000-12-31"))
print(date.valid("2026-10-27T14:30:00.123Z"), date.valid("2026-10-27", null))
```

```output
false false false
false false false
true false false
true true
```

### Errors

The value never fails. The second argument must be `"date"`, `"date-time"` or
`null`: anything else is a runtime error.

```quillo error
print(date.valid("2026-10-27", "time"))
```

```output
line 1: `date.valid` takes "date" or "date-time" as argument 2, got "time"
```

### Chaining

The value comes first in a pipeline. In a route, a check with a 400 of your own:

```quillo
print(["2026-10-27", "soon", "2026-02-30"] | filter(date.valid))
print("2026-10-27T14:30:00Z" | date.valid("date"))
```

```output
["2026-10-27"]
false
```

```quillo noexec
route POST /leave ? { from: str, to: str } {
    if !date.valid(from, "date") || !date.valid(to, "date") { reply 400 "give dates as YYYY-MM-DD" }
    date.days_between(from, to)
}
```

### See also

[date.parse](/docs/reference/date.parse/), [date.of](/docs/reference/date.of/), [date.parts](/docs/reference/date.parts/), [date.date_in](/docs/reference/date.date_in/), [type_of](/docs/reference/type_of/)
