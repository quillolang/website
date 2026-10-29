# date.today
date.today(str | null=) -> str
group: Dates

### What it does

The calendar date now, as ISO text `"YYYY-MM-DD"`, in UTC. With a time zone (an IANA
name like `"Europe/Paris"`, `"UTC"`, or an offset like `"+05:30"`) it is the date in
that zone, which can be a day before or after UTC's. It reads the clock, so it is the
`time` effect; a script run with `run_script` has the rest of `date` but not this.

### Examples

```quillo
let t = date.today()
print(len(t), type_of(t), date.valid(t, "date"))
print(t >= "2026-01-01", date.today("Europe/Paris") | date.valid)
```

```output
10 str true
true true
```

### Edge cases

- The zone decides the day: at the same instant `"+14:00"` is never behind
  `"-12:00"`, and can be two days ahead.
- `null` as the zone is UTC, the same as leaving it out.
- The text sorts in time order, so it compares with other dates as a string.
- It is UTC's date, not the visitor's: the server does not know a visitor's time zone.
  A page tells it with a cookie, see the user guide's Dates section.

```quillo
print(date.today("+14:00") >= date.today("-12:00"))
print(date.today(null) == date.today(), date.today("UTC") == date.today())
print(date.today() > "1999-12-31")
```

```output
true
true true
true
```

### Errors

A zone that is not a string, or a name the time zone database does not know, is a
runtime error, not an error value.

```quillo error
print(date.today("Mars/Olympus"))
```

```output
line 1: `date.today`: unknown time zone "Mars/Olympus"
```

### Chaining

The date comes first in a pipeline, so the arithmetic and formatting functions take it
as their first argument:

```quillo
print(date.today() | date.add_days(30) | date.valid("date"))
print(date.today() | date.format("YYYY") | len)
```

```output
true
4
```

### See also

[date.now](/docs/reference/date.now/), [now](/docs/reference/now/), [date.add_days](/docs/reference/date.add_days/), [date.format](/docs/reference/date.format/), [date.date_in](/docs/reference/date.date_in/)
