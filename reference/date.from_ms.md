# date.from_ms
date.from_ms(int, str | null=) -> str
group: Dates

### What it does

Milliseconds since 1970, as `now()` or [date.ms](/docs/reference/date.ms/) give them, as
a date-time to the second: `"2026-11-01T14:30:00Z"`. With a time zone (an IANA name,
`"UTC"` or an offset like `"+05:30"`) it is written at that zone's offset at that
instant; left out, in UTC. `date.from_ms(now(), "Europe/Lisbon")` is the time now in
Lisbon.

### Examples

```quillo
print(date.from_ms(0), date.from_ms(1793543400000))
print(date.from_ms(1793543400000, "Europe/Paris"), date.from_ms(1793543400000, "+05:30"))
print(date.from_ms(now()) | date.valid("date-time"))
```

```output
1970-01-01T00:00:00Z 2026-11-01T14:30:00Z
2026-11-01T15:30:00+01:00 2026-11-01T20:00:00+05:30
true
```

### Edge cases

- The milliseconds are dropped, not rounded: `...999` is the same second as `...000`.
- Negative numbers are before 1970, rounded down to the second: `-1` is the last second
  of 1969.
- A round trip through `date.ms` keeps the instant, to the second, and the offset given.
- A float with a whole value is taken as an int.

```quillo
print(date.from_ms(1793543400999), date.from_ms(-1), date.from_ms(-1500))
print(date.from_ms(date.ms("2026-10-27T15:30:00+01:00"), "+01:00"), date.from_ms(1793543400000.0))
print(date.from_ms(-62135596800000), date.from_ms(253402300799000))
```

```output
2026-11-01T14:30:00Z 1969-12-31T23:59:59Z 1969-12-31T23:59:58Z
2026-10-27T15:30:00+01:00 2026-11-01T14:30:00Z
0001-01-01T00:00:00Z 9999-12-31T23:59:59Z
```

### Errors

A number outside years 1 to 9999, a first argument that is not an int (text included),
or an unknown zone is a runtime error, not an error value.

```quillo error
print(date.from_ms(253402300800000))
```

```output
line 1: `date.from_ms`: the date is out of range (years 1 to 9999)
```

```quillo error
print(date.from_ms("1793543400000"))
```

```output
line 1: `date.from_ms` expects an int as argument 1, got "1793543400000"
```

### Chaining

The number comes first, so a stored time is shown in one line:

```quillo
print(1793111400000 | date.from_ms("America/New_York") | date.format("ddd D MMM, h:mm A"))
print([1793111400000, 1793025000000] | map(date.from_ms) | map(date.date_in))
```

```output
Tue 27 Oct, 10:30 AM
["2026-10-27", "2026-10-26"]
```

### See also

[date.ms](/docs/reference/date.ms/), [now](/docs/reference/now/), [date.to_zone](/docs/reference/date.to_zone/), [date.now](/docs/reference/date.now/), [date.format](/docs/reference/date.format/)
