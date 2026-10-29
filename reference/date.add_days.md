# date.add_days
date.add_days(str, int) -> str
group: Dates

### What it does

A date some days later, or earlier with a negative count, as ISO text. Months, years
and leap days are crossed as the calendar has them. It takes a date, not a date-time:
get a date-time's date with [date.date_in](/docs/reference/date.date_in/) first.

### Examples

```quillo
print(date.add_days("2026-10-27", 7), date.add_days("2026-10-27", -27))
print(date.add_days("2026-12-31", 1), date.add_days("2024-02-28", 1))
```

```output
2026-11-03 2026-09-30
2027-01-01 2024-02-29
```

### Edge cases

- Zero gives the date itself.
- A float with a whole value is taken as an int.
- The result stays within years 1 to 9999: past the end it is a runtime error, as is a
  count beyond four million days either way.

```quillo
print(date.add_days("2026-10-27", 0), date.add_days("2023-02-28", 1.0))
print(date.add_days("0001-01-01", 3652058))
```

```output
2026-10-27 2023-03-01
9999-12-31
```

### Errors

A date-time, text that is not a date, a count that is not an int, or a result out of
range is a runtime error, not an error value.

```quillo error
print(date.add_days("2026-10-27T10:00:00Z", 1))
```

```output
line 1: `date.add_days` expects a date (YYYY-MM-DD) as argument 1, got the date-time "2026-10-27T10:00:00Z" (`date.date_in` gives its date)
```

```quillo error
print(date.add_days("9999-12-31", 1))
```

```output
line 1: `date.add_days`: the date is out of range (years 1 to 9999)
```

### Chaining

The date comes first in a pipeline:

```quillo
print("2026-10-27" | date.add_days(14) | date.format("ddd D MMM"))
print(range(0, 3) | map((i) => "2026-10-30" | date.add_days(i)))
```

```output
Tue 10 Nov
["2026-10-30", "2026-10-31", "2026-11-01"]
```

### See also

[date.add_months](/docs/reference/date.add_months/), [date.add_years](/docs/reference/date.add_years/), [date.days_between](/docs/reference/date.days_between/), [date.date_in](/docs/reference/date.date_in/), [date.today](/docs/reference/date.today/)
