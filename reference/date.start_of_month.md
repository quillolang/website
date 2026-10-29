# date.start_of_month
date.start_of_month(str) -> str
group: Dates

### What it does

The first day of a date's month, as ISO text: `"2026-10-27"` gives `"2026-10-01"`. It
takes a date, not a date-time.

### Examples

```quillo
print(date.start_of_month("2026-10-27"), date.start_of_month("2024-02-29"))
```

```output
2026-10-01 2024-02-01
```

### Edge cases

- The first of a month gives itself.
- Combined with `date.add_months` it walks months: the start of next month, of last
  month.

```quillo
print(date.start_of_month("2026-10-01"))
print(date.start_of_month(date.add_months("2026-10-27", 1)), date.start_of_month("2026-01-15") | date.add_months(-1))
```

```output
2026-10-01
2026-11-01 2025-12-01
```

### Errors

A date-time, text that is not a date, or any other value is a runtime error, not an
error value.

```quillo error
print(date.start_of_month("2026-10-27T10:00:00Z"))
```

```output
line 1: `date.start_of_month` expects a date (YYYY-MM-DD) as argument 1, got the date-time "2026-10-27T10:00:00Z" (`date.date_in` gives its date)
```

### Chaining

```quillo
print("2026-10-27" | date.start_of_month | date.weekday)
print(["2026-10-27", "2026-10-03", "2026-11-14"] | map(date.start_of_month) | unique)
```

```output
4
["2026-10-01", "2026-11-01"]
```

### See also

[date.end_of_month](/docs/reference/date.end_of_month/), [date.add_months](/docs/reference/date.add_months/), [date.days_in_month](/docs/reference/date.days_in_month/), [date.date_in](/docs/reference/date.date_in/)
