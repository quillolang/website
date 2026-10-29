# date.is_leap_year
date.is_leap_year(int | str) -> bool
group: Dates

### What it does

Whether a year has a 29th of February: `true` for years divisible by 4, except
centuries, except those divisible by 400 (the Gregorian rule). It takes the year as an
int, or a date or date-time, whose year it uses.

### Examples

```quillo
print(date.is_leap_year(2024), date.is_leap_year(2023))
print(date.is_leap_year(1900), date.is_leap_year(2000))
print(date.is_leap_year("2024-06-01"))
```

```output
true false
false true
true
```

### Edge cases

- A date-time's year is read as written, like a date's.
- An int is not checked against the calendar's range: 0 and negative years answer by
  the same rule. A float with a whole value is taken as an int.

```quillo
print(date.is_leap_year("2024-12-31T23:00:00-05:00"))
print(date.is_leap_year(0), date.is_leap_year(-4), date.is_leap_year(2024.0))
```

```output
true
true true true
```

### Errors

A string that is not a date, or a value that is neither an int nor a string, is a
runtime error, not an error value.

```quillo error
print(date.is_leap_year("2024"))
```

```output
line 1: `date.is_leap_year` expects a date or a date-time as argument 1, got "2024"
```

### Chaining

```quillo
print(range(2023, 2029) | filter(date.is_leap_year))
print("2024-02-10" | date.is_leap_year)
```

```output
[2024, 2028]
true
```

### See also

[date.days_in_month](/docs/reference/date.days_in_month/), [date.parts](/docs/reference/date.parts/), [date.add_years](/docs/reference/date.add_years/), [date.end_of_month](/docs/reference/date.end_of_month/)
