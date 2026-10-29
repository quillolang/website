# date.at
date.at(str, str | null=, str | null=) -> str
group: Dates

### What it does

The instant a local time names: a date, a time of day `"HH:MM"` or `"HH:MM:SS"`, and a
time zone, as a date-time written at that zone's offset. `date.at("2026-10-27",
"17:00", "America/New_York")` is `"2026-10-27T17:00:00-04:00"`, five in the afternoon
in New York, with the offset of that day. The time left out (or `null`) is midnight;
the zone left out is UTC. It takes a date, not a date-time.

### Examples

```quillo
print(date.at("2026-10-27", "17:00", "America/New_York"))
print(date.at("2026-10-27", "09:15:30", "Asia/Kolkata"), date.at("2026-10-27", "17:00"))
print(date.at("2026-10-27"), date.at("2026-10-27", null, "Europe/Paris"))
```

```output
2026-10-27T17:00:00-04:00
2026-10-27T09:15:30+05:30 2026-10-27T17:00:00Z
2026-10-27T00:00:00Z 2026-10-27T00:00:00+01:00
```

### Edge cases

- A time that the clocks skip when they go forward is moved on by the gap: `02:30` on
  the night Paris springs forward is `03:30`. A time that happens twice when they go
  back is the first, the one still on summer time.
- The result is in local form; `date.to_zone` it for UTC, or `date.ms` for a number.
- The zone can be a fixed offset.

```quillo
print(date.at("2026-03-29", "02:30", "Europe/Paris"), date.at("2026-10-25", "02:30", "Europe/Paris"))
print(date.at("2026-03-08", "02:30", "America/New_York"), date.at("2026-11-01", "01:30", "America/New_York"))
print(date.at("2026-10-27", "17:00", "Europe/Paris") | date.to_zone)
print(date.at("2026-10-27", "23:59:59", "-10:00"))
```

```output
2026-03-29T03:30:00+02:00 2026-10-25T02:30:00+02:00
2026-03-08T03:30:00-04:00 2026-11-01T01:30:00-04:00
2026-10-27T16:00:00Z
2026-10-27T23:59:59-10:00
```

### Errors

A date-time or text that is not a date, a time that is not `HH:MM` or `HH:MM:SS` with
real hours, minutes and seconds, or an unknown zone is a runtime error, not an error
value.

```quillo error
print(date.at("2026-10-27", "5pm"))
```

```output
line 1: `date.at` expects a time (HH:MM or HH:MM:SS) as argument 2, got "5pm"
```

```quillo error
print(date.at("2026-10-27T10:00:00Z", "17:00"))
```

```output
line 1: `date.at` expects a date (YYYY-MM-DD) as argument 1, got the date-time "2026-10-27T10:00:00Z" (`date.date_in` gives its date)
```

### Chaining

The date comes first, so a day from a form becomes an instant for storing or
comparing:

```quillo
print("2026-10-27" | date.at("17:00", "America/New_York") | date.date_in("Asia/Tokyo"))
print("2026-10-27" | date.at("09:00", "Europe/Lisbon") | date.ms)
print(["2026-10-27", "2026-10-28"] | map((d) => date.at(d, "12:00", "+05:30")))
```

```output
2026-10-28
1793091600000
["2026-10-27T12:00:00+05:30", "2026-10-28T12:00:00+05:30"]
```

### See also

[date.to_zone](/docs/reference/date.to_zone/), [date.date_in](/docs/reference/date.date_in/), [date.ms](/docs/reference/date.ms/), [date.from_ms](/docs/reference/date.from_ms/), [date.parts](/docs/reference/date.parts/)
