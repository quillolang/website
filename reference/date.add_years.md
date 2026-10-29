# date.add_years
date.add_years(str, int) -> str
group: Dates

### What it does

The same month and day some years on, or back with a negative count, as ISO text. The
29th of February in a year without one becomes the 28th: `2024-02-29` plus a year is
`2025-02-28`. It is `date.add_months` with twelve times the count, and takes a date,
not a date-time.

### Examples

```quillo
print(date.add_years("2026-10-27", 1), date.add_years("2026-10-27", -30))
print(date.add_years("2024-02-29", 1), date.add_years("2024-02-29", 4))
```

```output
2027-10-27 1996-10-27
2025-02-28 2028-02-29
```

### Edge cases

- A leap day comes back when the target year has one: plus four years is
  `2028-02-29`, minus four `2020-02-29`.
- Zero gives the date itself; a float with a whole value is taken as an int.
- The result stays within years 1 to 9999; a count past 10,000 years either way is an
  error whatever the date.

```quillo
print(date.add_years("2024-02-29", -4), date.add_years("2024-02-29", 0))
print(date.add_years("2024-02-29", 1) == date.add_months("2024-02-29", 12))
```

```output
2020-02-29 2024-02-29
true
```

### Errors

A date-time, text that is not a date, a count that is not an int, or a result out of
range is a runtime error, not an error value.

```quillo error
print(date.add_years("0001-06-01", -1))
```

```output
line 1: `date.add_years`: the date is out of range (years 1 to 9999)
```

### Chaining

```quillo
print("2026-10-27" | date.add_years(18) | date.format({ locale: "en-GB", style: "long" }))
print("2000-02-29" | date.add_years(26) | date.weekday)
```

```output
27 October 2044
6
```

### See also

[date.add_months](/docs/reference/date.add_months/), [date.add_days](/docs/reference/date.add_days/), [date.is_leap_year](/docs/reference/date.is_leap_year/), [date.months_between](/docs/reference/date.months_between/)
