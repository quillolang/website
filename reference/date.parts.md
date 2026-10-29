# date.parts
date.parts(str) -> map
group: Dates

### What it does

A date taken apart: a map `{ year, month, day, weekday }` of ints, weekday 1 for Monday
to 7 for Sunday. A date-time adds `hour`, `minute`, `second` and its `offset` as text
(`"Z"`, `"+01:00"`), the time as written, not moved to UTC.

### Examples

```quillo
print(date.parts("2026-10-27"))
print(date.parts("2026-10-27T14:30:05+01:00"))
let { year, month, day } = date.parts("2024-02-29")
print(year, month, day)
```

```output
{ year: 2026, month: 10, day: 27, weekday: 2 }
{ year: 2026, month: 10, day: 27, weekday: 2, hour: 14, minute: 30, second: 5, offset: "+01:00" }
2024 2 29
```

### Edge cases

- A date has no time keys, so `.hour` of its parts is `null`.
- A date-time's parts are its local ones: `"2026-10-27T23:30:00-05:00"` is day 27, hour
  23, though in UTC it is already the 28th. `date.to_zone` it first for another zone's.
- An offset of zero is `"Z"`; a fraction of a second is dropped.

```quillo
print(date.parts("2026-10-27").hour)
print(date.parts("2026-10-27T23:30:00-05:00").day, date.parts(date.to_zone("2026-10-27T23:30:00-05:00")).day)
print(date.parts("2026-10-27T14:30:05.250Z"))
```

```output
null
27 28
{ year: 2026, month: 10, day: 27, weekday: 2, hour: 14, minute: 30, second: 5, offset: "Z" }
```

### Errors

Text that is not a date or a date-time, or any other value, is a runtime error, not an
error value.

```quillo error
print(date.parts("2026-02-30"))
```

```output
line 1: `date.parts` expects a date or a date-time as argument 1, got "2026-02-30"
```

### Chaining

```quillo
print("2026-10-27" | date.parts | keys)
print(["2026-10-27", "2026-11-01"] | map((d) => date.parts(d).weekday))
```

```output
["year", "month", "day", "weekday"]
[2, 7]
```

### See also

[date.of](/docs/reference/date.of/), [date.weekday](/docs/reference/date.weekday/), [date.format](/docs/reference/date.format/), [date.to_zone](/docs/reference/date.to_zone/), [date.valid](/docs/reference/date.valid/)
