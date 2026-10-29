# date.parse
date.parse(str, str | null=) -> str | error(str)
group: Dates

### What it does

Reads text as a date or a date-time and gives it back in the form the `date` module
uses: `"2026-10-27"` or `"2026-10-27T14:30:00Z"`. Without a pattern it reads ISO text:
a date, or a date and time joined by `T` or a space, seconds optional, with an offset
(`Z`, `+01:00`, `+0100` or `+01`). With a pattern (`"DD/MM/YYYY"`, the tokens of
[date.format](/docs/reference/date.format/)) it reads that form, with English names.
Text that is not a date is an error value, not a runtime error, so a visitor's input
can be checked with `is_err` or given a default with `??`.

### Examples

```quillo
print(date.parse("2026-10-27"), date.parse("2026-10-27 14:30:00+01"))
print(date.parse("27/10/2026", "DD/MM/YYYY"), date.parse("October 27, 2026", "MMMM D, YYYY"))
print(date.parse("27/10/2026 2:30 PM", "DD/MM/YYYY h:mm A"))
print(date.parse("12/31/2026", "MM/DD/YYYY") ?? "no date")
```

```output
2026-10-27 2026-10-27T14:30:00+01:00
2026-10-27 2026-10-27
2026-10-27T14:30:00Z
2026-12-31
```

### Edge cases

- The result is normalised: `+00:00` and `+0100` come back as `Z` and `+01:00`, a
  space becomes `T`, and spaces around the text are ignored.
- A fraction of a second is kept as written (`.250`), after `.` or `,`.
- Without a pattern a date-time needs its offset: `"2026-10-27 14:30"` is an error.
  With a pattern and a time but no `Z` token, the time is UTC.
- Numbers must have their digits: `"2026-1-5"` is not ISO, and `DD` wants two digits
  where `D` takes one or two.
- `YY` is 2000 to 2099; `h` with `A` reads a 12-hour clock, so `12:30 AM` is `00:30`.
- Names are matched ignoring case; `ddd` and `dddd` are read and ignored.
- A pattern's `Z` reads `Z`, `+01:00` or `+0100`, not `+01`.
- An impossible day (`2026-02-30`, `31/02/2026`) is an error, and so are years outside 1
  to 9999.

```quillo
print(date.parse("2026-10-27T14:30:00+00:00"), date.parse("2026-10-27T14:30:00.250+0100"))
print(date.parse("2026-10-27 14:30"), date.parse("2026-1-5"))
print(date.parse("27/10/26", "DD/MM/YY"), date.parse("27/10/2026 12:30 AM", "DD/MM/YYYY h:mm A"))
print(date.parse("tue, 27 OCT 2026", "ddd, D MMM YYYY"), date.parse("27/10/2026 14:30 +0100", "DD/MM/YYYY HH:mm Z"))
print(date.parse("27/10/2026 14:30 +01", "DD/MM/YYYY HH:mm Z"))
print(date.parse("2026-02-30"), date.parse("0000-01-01"))
```

```output
2026-10-27T14:30:00Z 2026-10-27T14:30:00.250+01:00
err("not a date or a date-time: \"2026-10-27 14:30\"") err("not a date or a date-time: \"2026-1-5\"")
2026-10-27 2026-10-27T00:30:00Z
2026-10-27 2026-10-27T14:30:00+01:00
err("\"27/10/2026 14:30 +01\" is not a date in the form \"DD/MM/YYYY HH:mm Z\"")
err("not a date or a date-time: \"2026-02-30\"") err("not a date or a date-time: \"0000-01-01\"")
```

### Errors

Bad text is an error value whose message names the text, and the pattern when there is
one. The text must be a string and the pattern a string: anything else is a runtime
error.

```quillo
let d = date.parse("next tuesday")
print(is_err(d), d.error)
print(date.parse("31/02/2026", "DD/MM/YYYY").error)
```

```output
true not a date or a date-time: "next tuesday"
"31/02/2026" is not a date in the form "DD/MM/YYYY"
```

```quillo error
print(date.parse(20261027))
```

```output
line 1: `date.parse` expects a str as argument 1, got int
```

### Chaining

The text comes first in a pipeline. `?` passes the error on, and `??` gives a default:

```quillo
print("27/10/2026" | date.parse("DD/MM/YYYY") | date.add_days(7))
print(["2026-10-27", "soon", "2026-11-03"] | map(date.parse) | filter((d) => !is_err(d)))
fn due(s) = date.parse(s)? | date.add_months(1)
print(due("2026-01-31"), due("January"))
```

```output
2026-11-03
["2026-10-27", "2026-11-03"]
2026-02-28 err("not a date or a date-time: \"January\"")
```

### See also

[date.valid](/docs/reference/date.valid/), [date.format](/docs/reference/date.format/), [date.of](/docs/reference/date.of/), [is_err](/docs/reference/is_err/), [date.parts](/docs/reference/date.parts/)
