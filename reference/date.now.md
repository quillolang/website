# date.now
date.now(str | null=) -> str
group: Dates

### What it does

The date and time now, to the second, as RFC 3339 text: `"2026-10-27T14:30:00Z"` in
UTC. With a time zone (an IANA name, `"UTC"`, or an offset like `"+05:30"`) it is the
same instant written at that zone's offset, `"2026-10-27T15:30:00+01:00"`. It reads the
clock, so it is the `time` effect, and a script run with `run_script` does without it.
For milliseconds as an int, use [now](/docs/reference/now/).

### Examples

```quillo
let t = date.now()
print(len(t), type_of(t), date.valid(t, "date-time"))
print(ends_with(t, "Z"), date.date_in(t) == date.today())
```

```output
20 str true
true true
```

### Edge cases

- There are no fractions of a second: the text is always 20 characters in UTC.
- An offset of zero is written `Z`, never `+00:00`.
- In a named zone the offset follows daylight saving: Paris is `+01:00` or `+02:00`
  depending on the day.
- `date.ms` of the result never passes `now()` read right after it: the two read the
  same clock, one to the second, the other to the millisecond.

```quillo
let paris = date.now("Europe/Paris")
print(len(paris), ends_with(paris, "+01:00") || ends_with(paris, "+02:00"))
print(date.now("+05:30") | ends_with("+05:30"), date.now(null) | ends_with("Z"))
print(date.ms(date.now()) <= now())
```

```output
25 true
true true
true
```

### Errors

A zone that is not a string, or one the time zone database does not know, is a runtime
error, not an error value.

```quillo error
print(date.now("Europe/Nowhere"))
```

```output
line 1: `date.now`: unknown time zone "Europe/Nowhere"
```

### Chaining

```quillo
print(date.now() | date.date_in("Asia/Tokyo") | date.valid("date"))
print(date.now() | date.to_zone("America/New_York") | date.parts | keys)
```

```output
true
["year", "month", "day", "weekday", "hour", "minute", "second", "offset"]
```

### See also

[date.today](/docs/reference/date.today/), [now](/docs/reference/now/), [date.to_zone](/docs/reference/date.to_zone/), [date.date_in](/docs/reference/date.date_in/), [date.ms](/docs/reference/date.ms/), [date.format](/docs/reference/date.format/)
