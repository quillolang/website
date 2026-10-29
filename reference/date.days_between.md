# date.days_between
date.days_between(str, str) -> int
group: Dates

### What it does

The number of days from one date to another, the second minus the first: the nights of
a stay, the age of an order in days. Negative when the second date is earlier. It takes
dates, not date-times: for the time between two instants subtract their
[date.ms](/docs/reference/date.ms/).

### Examples

```quillo
print(date.days_between("2026-11-05", "2026-11-14"))
print(date.days_between("2026-11-14", "2026-11-05"))
print(date.days_between("2024-01-01", "2025-01-01"), date.days_between("2023-01-01", "2024-01-01"))
```

```output
9
-9
366 365
```

### Edge cases

- The same date twice is 0.
- It counts calendar days, with no daylight saving to lose or gain an hour.
- The whole calendar fits in an int: from year 1 to year 9999 is about 3.65 million
  days.

```quillo
print(date.days_between("2026-10-27", "2026-10-27"))
print(date.days_between("2026-10-24", "2026-10-26"))
print(date.days_between("0001-01-01", "9999-12-31"))
```

```output
0
2
3652058
```

### Errors

A date-time, text that is not a date, or any other value in either place is a runtime
error, not an error value.

```quillo error
print(date.days_between("2026-10-27", "2026-10-27T00:00:00Z"))
```

```output
line 1: `date.days_between` expects a date (YYYY-MM-DD) as argument 2, got the date-time "2026-10-27T00:00:00Z" (`date.date_in` gives its date)
```

### Chaining

In a pipeline the first date comes first, so `from | date.days_between(to)`:

```quillo
print("2026-10-27" | date.days_between("2026-12-25"))
let stays = [["2026-11-05", "2026-11-14"], ["2026-12-01", "2026-12-03"]]
print(stays | map((s) => date.days_between(s[0], s[1])) | sum)
```

```output
59
11
```

### See also

[date.months_between](/docs/reference/date.months_between/), [date.add_days](/docs/reference/date.add_days/), [date.ms](/docs/reference/date.ms/), [date.date_in](/docs/reference/date.date_in/), [date.weekday](/docs/reference/date.weekday/)
