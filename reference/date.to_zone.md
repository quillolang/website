# date.to_zone
date.to_zone(str, str | null=) -> str
group: Dates

### What it does

The same instant written at a time zone's offset: `"2026-10-27T14:30:00Z"` in
`"Europe/Paris"` is `"2026-10-27T15:30:00+01:00"`. The zone is an IANA name, `"UTC"`,
or a fixed offset like `"+05:30"`; left out, it is UTC, which turns any date-time into
its UTC form. A named zone's offset follows daylight saving on that day. It takes a
date-time; a date has no instant to move.

### Examples

```quillo
print(date.to_zone("2026-10-27T14:30:00Z", "Europe/Paris"))
print(date.to_zone("2026-10-27T14:30:00Z", "America/New_York"), date.to_zone("2026-10-27T14:30:00Z", "Asia/Kolkata"))
print(date.to_zone("2026-10-27T15:30:00+01:00"))
```

```output
2026-10-27T15:30:00+01:00
2026-10-27T10:30:00-04:00 2026-10-27T20:00:00+05:30
2026-10-27T14:30:00Z
```

### Edge cases

- The calendar date can change: half past eleven at night in UTC is the next day in
  Auckland and the day before in Honolulu. `date.date_in` gives that date alone.
- Summer and winter differ in a named zone: Paris is `+02:00` in July, `+01:00` in
  December.
- An offset of zero is written `Z`, never `+00:00`; `"utc"` in any case and `"Z"`
  name UTC.
- A fraction of a second is kept as written.
- The result compares equal to a date-time of the same text, but not to the same
  instant written at another offset: compare instants with `date.ms`.
- Far back, before standard time, a zone's offset is its local mean time, with seconds.

```quillo
print(date.to_zone("2026-10-27T23:30:00Z", "Pacific/Auckland"), date.to_zone("2026-10-27T02:30:00Z", "Pacific/Honolulu"))
print(date.to_zone("2026-07-01T12:00:00Z", "Europe/Paris"), date.to_zone("2026-12-01T12:00:00Z", "Europe/Paris"))
print(date.to_zone("2026-10-27T14:30:00+00:00", "utc"), date.to_zone("2026-10-27T14:30:00.250Z", "-03:00"))
print(date.to_zone("2026-10-27T14:30:00Z", "Europe/Paris") == "2026-10-27T14:30:00Z")
print(date.to_zone("1900-01-01T00:00:00Z", "Europe/Paris"))
```

```output
2026-10-28T12:30:00+13:00 2026-10-26T16:30:00-10:00
2026-07-01T14:00:00+02:00 2026-12-01T13:00:00+01:00
2026-10-27T14:30:00Z 2026-10-27T11:30:00.250-03:00
false
1900-01-01T00:09:21+00:09:21
```

### Errors

A date instead of a date-time, text that is neither, an unknown zone, an offset that is
not `+HH:MM` (`"+5"`, `"+25:00"`), or a result outside years 1 to 9999 is a runtime
error, not an error value.

```quillo error
print(date.to_zone("2026-10-27", "Europe/Paris"))
```

```output
line 1: `date.to_zone` expects a date-time (like 2026-10-27T14:30:00Z) as argument 1, got "2026-10-27"
```

```quillo error
print(date.to_zone("2026-10-27T14:30:00Z", "Europe/Nowhere"))
```

```output
line 1: `date.to_zone`: unknown time zone "Europe/Nowhere"
```

### Chaining

The date-time comes first, so a stored UTC time is shown in a zone and formatted in
one line:

```quillo
print("2026-10-27T14:30:00Z" | date.to_zone("Asia/Tokyo") | date.format("HH:mm Z"))
print(date.from_ms(1793111400000) | date.to_zone("Europe/Lisbon") | date.parts | (p) => p.hour)
```

```output
23:30 +09:00
14
```

### See also

[date.date_in](/docs/reference/date.date_in/), [date.at](/docs/reference/date.at/), [date.from_ms](/docs/reference/date.from_ms/), [date.ms](/docs/reference/date.ms/), [date.format](/docs/reference/date.format/), [date.now](/docs/reference/date.now/)
