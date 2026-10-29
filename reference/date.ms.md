# date.ms
date.ms(str) -> int
group: Dates

### What it does

A date-time as milliseconds since 1970-01-01T00:00:00Z, the number `now()` gives, so
times can be subtracted, compared across offsets and stored as ints. A date counts as
its midnight in UTC. [date.from_ms](/docs/reference/date.from_ms/) goes back.

### Examples

```quillo
print(date.ms("2026-10-27T14:30:00Z"), date.ms("2026-10-27"))
print(date.ms("1970-01-01"), date.ms("1970-01-01T00:00:01Z"))
print((date.ms("2026-10-28") - date.ms("2026-10-27")) / 3600000)
```

```output
1793111400000 1793059200000
0 1000
24
```

### Edge cases

- The same instant at any offset gives the same number: `15:30:00+01:00` is
  `14:30:00Z`.
- A fraction of a second is kept to the millisecond and cut there, not rounded.
- Before 1970 the number is negative; the whole range of years 1 to 9999 fits.
- Two date-times at different offsets compare by instant through `date.ms`, where the
  text would compare by its characters.

```quillo
print(date.ms("2026-10-27T15:30:00+01:00") == date.ms("2026-10-27T14:30:00Z"))
print(date.ms("2026-10-27T14:30:00.250Z"), date.ms("2026-10-27T14:30:00.9999Z"))
print(date.ms("1969-12-31T23:59:59Z"), date.ms("0001-01-01"), date.ms("9999-12-31T23:59:59Z"))
print(date.ms("2026-10-27T14:30:00Z") < date.ms("2026-10-27T15:00:00+01:00"), "2026-10-27T14:30:00Z" < "2026-10-27T15:00:00+01:00")
```

```output
true
1793111400250 1793111400999
-1000 -62135596800000 253402300799000
false true
```

### Errors

Text that is not a date or a date-time, or any other value, is a runtime error, not an
error value.

```quillo error
print(date.ms(1793111400000))
```

```output
line 1: `date.ms` expects a date or a date-time as argument 1, got int
```

### Chaining

```quillo
print("2026-10-27" | date.at("09:00", "Europe/Lisbon") | date.ms)
let stamps = ["2026-10-27T15:00:00+01:00", "2026-10-27T13:30:00Z", "2026-10-27T08:00:00-05:00"]
print(stamps | sort_by(date.ms) | map(date.to_zone))
```

```output
1793091600000
["2026-10-27T13:00:00Z", "2026-10-27T13:30:00Z", "2026-10-27T14:00:00Z"]
```

### See also

[date.from_ms](/docs/reference/date.from_ms/), [now](/docs/reference/now/), [date.to_zone](/docs/reference/date.to_zone/), [date.at](/docs/reference/date.at/), [date.days_between](/docs/reference/date.days_between/)
