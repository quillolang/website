# date.days_in_month
date.days_in_month(int | str, int=) -> int
group: Dates

### What it does

How many days a month has: 28 to 31. Given a date (or a date-time) it answers for that
date's month; given a year and a month as ints, for that month of that year. February
is 29 in a leap year.

### Examples

```quillo
print(date.days_in_month("2026-02-10"), date.days_in_month("2024-02-10"))
print(date.days_in_month(2026, 4), date.days_in_month(2026, 1))
```

```output
28 29
30 31
```

### Edge cases

- With a date, a second argument is ignored.
- A date-time counts as its date.
- An int year is not checked against the calendar's range: year 0 answers by the leap
  rule.

```quillo
print(date.days_in_month("2026-10-27", 5))
print(date.days_in_month("2026-02-10T12:00:00Z"))
print(date.days_in_month(0, 2))
```

```output
31
28
29
```

### Errors

A month outside 1 to 12, a year without a month, or a first argument that is neither
an int nor a date is a runtime error, not an error value.

```quillo error
print(date.days_in_month(2026, 13))
```

```output
line 1: `date.days_in_month`: there is no month 13
```

### Chaining

```quillo
print("2026-02-10" | date.days_in_month)
print(range(1, 13) | map((m) => date.days_in_month(2026, m)) | sum)
```

```output
28
365
```

### See also

[date.end_of_month](/docs/reference/date.end_of_month/), [date.is_leap_year](/docs/reference/date.is_leap_year/), [date.start_of_month](/docs/reference/date.start_of_month/), [date.of](/docs/reference/date.of/)
