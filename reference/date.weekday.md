# date.weekday
date.weekday(str) -> int
group: Dates

### What it does

The day of the week of a date, as an int: 1 for Monday to 7 for Sunday (ISO 8601). A
date-time gives the weekday of its date as written. For the name, use
[date.format](/docs/reference/date.format/) with `dddd` or `ddd`.

### Examples

```quillo
print(date.weekday("2026-10-27"), date.weekday("2026-10-26"), date.weekday("2026-11-01"))
print(date.format("2026-10-27", "dddd"))
```

```output
2 1 7
Tuesday
```

### Edge cases

- Saturday and Sunday are 6 and 7, so `weekday >= 6` is a weekend test.
- A date-time's weekday is that of its local date, not of the date in UTC.
- The calendar is the proleptic Gregorian one back to year 1: `1970-01-01` is a
  Thursday, `0001-01-01` a Monday.

```quillo
print(["2026-10-30", "2026-10-31", "2026-11-01"] | map((d) => date.weekday(d) >= 6))
print(date.weekday("2026-10-27T23:00:00-05:00"))
print(date.weekday("1970-01-01"), date.weekday("0001-01-01"))
```

```output
[false, true, true]
2
4 1
```

### Errors

Text that is not a date or a date-time, or any other value, is a runtime error, not an
error value.

```quillo error
print(date.weekday("today"))
```

```output
line 1: `date.weekday` expects a date or a date-time as argument 1, got "today"
```

### Chaining

```quillo
let names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
print("2026-10-27" | date.weekday | (n) => names[n - 1])
print(range(0, 7) | map((i) => date.add_days("2026-10-26", i)) | filter((d) => date.weekday(d) < 6) | len)
```

```output
Tue
5
```

### See also

[date.parts](/docs/reference/date.parts/), [date.format](/docs/reference/date.format/), [date.add_days](/docs/reference/date.add_days/), [date.days_between](/docs/reference/date.days_between/)
