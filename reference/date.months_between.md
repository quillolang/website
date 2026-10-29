# date.months_between
date.months_between(str, str) -> int
group: Dates

### What it does

The number of whole months from one date to another: the largest count that
`date.add_months` can add to the first date without passing the second. A month that
has not completed does not count. Negative, by the same count the other way, when the
second date is earlier. It takes dates, not date-times.

### Examples

```quillo
print(date.months_between("2026-01-15", "2026-02-15"), date.months_between("2026-01-15", "2026-02-14"))
print(date.months_between("2020-01-01", "2026-10-27"))
print(date.months_between("2026-02-28", "2026-01-31"))
```

```output
1 0
81
-1
```

### Edge cases

- Clamping counts: `2026-01-31` to `2026-02-28` is one month, since the 31st plus a month
  is the 28th; so is `2026-03-31` to `2026-04-30`, and `2024-02-29` to `2025-02-28` is
  twelve.
- The same date twice is 0.
- Backwards is the mirror of forwards: `b` to `a` is minus `a` to `b`.

```quillo
print(date.months_between("2026-01-31", "2026-02-28"), date.months_between("2026-03-31", "2026-04-30"))
print(date.months_between("2024-02-29", "2025-02-28"), date.months_between("2026-10-27", "2026-10-27"))
print(date.months_between("2026-04-30", "2026-03-31"))
```

```output
1 1
12 0
-1
```

### Errors

A date-time, text that is not a date, or any other value in either place is a runtime
error, not an error value.

```quillo error
print(date.months_between("2026-10-27", null))
```

```output
line 1: `date.months_between` expects a date (YYYY-MM-DD) as argument 2, got null
```

### Chaining

```quillo
print("2024-05-01" | date.months_between("2026-10-27"))
let months = date.months_between("2026-01-31", "2026-04-15")
print(range(1, months + 1) | map((n) => date.add_months("2026-01-31", n)))
```

```output
29
["2026-02-28", "2026-03-31"]
```

### See also

[date.days_between](/docs/reference/date.days_between/), [date.add_months](/docs/reference/date.add_months/), [date.add_years](/docs/reference/date.add_years/), [date.end_of_month](/docs/reference/date.end_of_month/)
