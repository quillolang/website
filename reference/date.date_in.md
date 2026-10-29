# date.date_in
date.date_in(str, str | null=) -> str
group: Dates

### What it does

The calendar date of a date-time in a time zone: what day it is there at that instant,
as ISO text `"YYYY-MM-DD"`. The zone is an IANA name, `"UTC"` or an offset like
`"+05:30"`; left out, it is UTC. It is also the way from a date-time to a date for the
functions that take only dates (`date.add_days`, `date.days_between` and the rest).

### Examples

```quillo
print(date.date_in("2026-10-27T23:30:00Z", "Asia/Tokyo"), date.date_in("2026-10-27T03:30:00Z", "America/Los_Angeles"))
print(date.date_in("2026-10-27T23:30:00Z"))
print(date.date_in("2026-10-27T15:30:00+01:00") | date.add_days(1))
```

```output
2026-10-28 2026-10-26
2026-10-27
2026-10-28
```

### Edge cases

- Without a zone the date is UTC's, not the one written: `"2026-10-27T00:30:00+02:00"`
  is still the 26th in UTC.
- With the date-time's own offset as the zone, it is the date as written.
- Daylight saving is followed on that day in a named zone.

```quillo
print(date.date_in("2026-10-27T00:30:00+02:00"), date.date_in("2026-10-27T00:30:00+02:00", "+02:00"))
print(date.date_in("2026-10-27T23:30:00Z", "+01:00"), date.date_in("2026-07-01T22:30:00Z", "Europe/Paris"))
```

```output
2026-10-26 2026-10-27
2026-10-28 2026-07-02
```

### Errors

A date instead of a date-time, text that is neither, or an unknown zone is a runtime
error, not an error value.

```quillo error
print(date.date_in("2026-10-27", "UTC"))
```

```output
line 1: `date.date_in` expects a date-time (like 2026-10-27T14:30:00Z) as argument 1, got "2026-10-27"
```

```quillo error
print(date.date_in("2026-10-27T14:30:00Z", "Paris"))
```

```output
line 1: `date.date_in`: unknown time zone "Paris"
```

### Chaining

```quillo
print("2026-10-27T23:30:00Z" | date.date_in("Asia/Tokyo") | date.weekday)
print(date.from_ms(1793111400000) | date.date_in("Pacific/Auckland") | date.format({ locale: "en-NZ", style: "full" }))
```

```output
3
Wednesday, 28 October 2026
```

### See also

[date.to_zone](/docs/reference/date.to_zone/), [date.at](/docs/reference/date.at/), [date.today](/docs/reference/date.today/), [date.add_days](/docs/reference/date.add_days/), [date.parts](/docs/reference/date.parts/)
