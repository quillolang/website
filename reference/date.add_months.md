# date.add_months
date.add_months(str, int) -> str
group: Dates

### What it does

The same day of the month some months on, or back with a negative count, as ISO text.
When that month is shorter the day is clamped to its last: `2026-01-31` plus a month is
`2026-02-28`, not the 3rd of March. It takes a date, not a date-time.

### Examples

```quillo
print(date.add_months("2026-10-27", 1), date.add_months("2026-10-27", -10))
print(date.add_months("2026-01-31", 1), date.add_months("2024-01-31", 1))
print(date.add_months("2026-10-27", 14))
```

```output
2026-11-27 2025-12-27
2026-02-28 2024-02-29
2027-12-27
```

### Edge cases

- Clamping loses the day: adding a month and taking it off again does not always come
  back. `2026-01-31` plus one is `2026-02-28`, minus one is `2026-01-28`.
- A clamped day is not carried on: `2026-01-31` plus two months is `2026-03-31`, the
  count is applied once.
- Zero gives the date itself; a float with a whole value is taken as an int.
- The result stays within years 1 to 9999; a count past 120,000 months either way is
  an error whatever the date.

```quillo
print(date.add_months(date.add_months("2026-01-31", 1), -1))
print(date.add_months("2026-01-31", 2), date.add_months("2026-03-31", -1))
print(date.add_months("2026-10-27", 0))
```

```output
2026-01-28
2026-03-31 2026-02-28
2026-10-27
```

### Errors

A date-time, text that is not a date, a count that is not an int, or a result out of
range is a runtime error, not an error value.

```quillo error
print(date.add_months("9999-12-01", 1))
```

```output
line 1: `date.add_months`: the date is out of range (years 1 to 9999)
```

### Chaining

```quillo
print("2026-01-31" | date.add_months(1) | date.end_of_month)
print(range(1, 4) | map((n) => "2026-01-31" | date.add_months(n)))
```

```output
2026-02-28
["2026-02-28", "2026-03-31", "2026-04-30"]
```

### See also

[date.add_years](/docs/reference/date.add_years/), [date.add_days](/docs/reference/date.add_days/), [date.months_between](/docs/reference/date.months_between/), [date.end_of_month](/docs/reference/date.end_of_month/), [date.days_in_month](/docs/reference/date.days_in_month/)
