# date.end_of_month
date.end_of_month(str) -> str
group: Dates

### What it does

The last day of a date's month, as ISO text: the 28th, 29th, 30th or 31st, the leap
year taken into account. It takes a date, not a date-time.

### Examples

```quillo
print(date.end_of_month("2026-10-27"), date.end_of_month("2026-04-01"))
print(date.end_of_month("2026-02-10"), date.end_of_month("2024-02-10"))
```

```output
2026-10-31 2026-04-30
2026-02-28 2024-02-29
```

### Edge cases

- The last day of a month gives itself.
- The day after it is the start of the next month, so `date.add_days(end, 1)` is a
  way to the first of next month too.

```quillo
print(date.end_of_month("2026-10-31"))
print(date.end_of_month("2026-10-27") | date.add_days(1))
```

```output
2026-10-31
2026-11-01
```

### Errors

A date-time, text that is not a date, or any other value is a runtime error, not an
error value.

```quillo error
print(date.end_of_month("27/10/2026"))
```

```output
line 1: `date.end_of_month` expects a date (YYYY-MM-DD) as argument 1, got "27/10/2026"
```

### Chaining

```quillo
print("2026-10-27" | date.end_of_month | date.format("dddd D MMMM"))
print(range(1, 13) | map((m) => date.of(2026, m, 1) | date.end_of_month | date.parts | (p) => p.day))
```

```output
Saturday 31 October
[31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
```

### See also

[date.start_of_month](/docs/reference/date.start_of_month/), [date.days_in_month](/docs/reference/date.days_in_month/), [date.add_months](/docs/reference/date.add_months/), [date.is_leap_year](/docs/reference/date.is_leap_year/)
