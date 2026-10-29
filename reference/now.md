# now
now() -> int
group: Dates

### What it does

The time now as milliseconds since 1970-01-01T00:00:00Z, an int: the clock for
measuring how long something took, for timestamps stored as numbers and for
`max_age`-style arithmetic. [date.from_ms](/docs/reference/date.from_ms/) turns it into a
date-time and [date.ms](/docs/reference/date.ms/) a date-time into it. It is the `time`
effect. For today's date or the time as text, see [date.today](/docs/reference/date.today/)
and [date.now](/docs/reference/date.now/).

### Examples

```quillo
let t = now()
print(type_of(t), len(str(t)), t > 1700000000000)
print(date.from_ms(t) | date.valid("date-time"))
```

```output
int 13 true
true
```

### Edge cases

- It is read each time it is called, so two calls in a row can differ by a few
  milliseconds and never go backwards within a program, as the system clock has it.
- Time in a component's state is read once: `let started = now()` stays as it was,
  since values are not re-read; a clock is a state that `every` sets.
- Day arithmetic is plain: a day is `24 * 60 * 60 * 1000`.

```quillo
let a = now()
sleep(5)
let b = now()
print(b >= a + 5)
let day = 24 * 60 * 60 * 1000
print((date.from_ms(now() + day) | date.date_in) == date.add_days(date.today(), 1))
```

```output
true
true
```

### Errors

It takes no arguments and cannot fail; there is nothing to check.

```quillo
print(now() - now() <= 0)
```

```output
true
```

### Chaining

```quillo
print(now() | date.from_ms("Europe/Lisbon") | date.valid("date-time"))
print(now() | date.from_ms | date.date_in | len)
```

```output
true
10
```

### See also

[date.now](/docs/reference/date.now/), [date.today](/docs/reference/date.today/), [date.from_ms](/docs/reference/date.from_ms/), [date.ms](/docs/reference/date.ms/), [sleep](/docs/reference/sleep/)
