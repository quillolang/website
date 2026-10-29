# date.of
date.of(int, int, int) -> str
group: Dates

### What it does

The date with a year, a month and a day, as ISO text `"YYYY-MM-DD"`. The month and the
day are 1-based, and the day must exist in that month of that year. It is the way from
numbers to a date; [date.parts](/docs/reference/date.parts/) goes back.

### Examples

```quillo
print(date.of(2026, 10, 27), date.of(2024, 2, 29))
let { year, month } = date.parts("2026-10-27")
print(date.of(year, month + 1, 1))
```

```output
2026-10-27 2024-02-29
2026-11-01
```

### Edge cases

- Years are 1 to 9999, padded to four digits: `date.of(1, 1, 1)` is `"0001-01-01"`.
- There is no rolling over: day 32 or month 13 is an error, not the next month or year;
  use `date.add_days` and `date.add_months` for that.
- A float with a whole value is taken as an int.

```quillo
print(date.of(1, 1, 1), date.of(9999, 12, 31), date.of(2026.0, 1, 1))
print(date.of(2026, 12, 31) | date.add_days(1))
```

```output
0001-01-01 9999-12-31 2026-01-01
2027-01-01
```

### Errors

A day that does not exist in the month, a month outside 1 to 12 or a year outside 1 to
9999 is a runtime error, not an error value, as is an argument that is not an int.

```quillo error
print(date.of(2023, 2, 29))
```

```output
line 1: `date.of`: there is no date 2023-2-29
```

### Chaining

The year comes first in a pipeline, which is rarely what is wanted; it is more often
the end of one:

```quillo
let [y, m, d] = "2026-10-27" | split("-") | map(int)
print(date.of(y, m, d) | date.format("D MMMM YYYY"))
print(range(1, 4) | map((m) => date.of(2026, m, 1) | date.end_of_month))
```

```output
27 October 2026
["2026-01-31", "2026-02-28", "2026-03-31"]
```

### See also

[date.parts](/docs/reference/date.parts/), [date.parse](/docs/reference/date.parse/), [date.valid](/docs/reference/date.valid/), [date.days_in_month](/docs/reference/date.days_in_month/), [date.add_days](/docs/reference/date.add_days/)
