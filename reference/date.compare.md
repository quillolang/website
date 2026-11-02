# date.compare
date.compare(str, str) -> int
group: Dates

### What it does

-1, 0 or 1 as `a` is before, at or after `b`, by the instants they name: a fraction of a
second, an offset and the way each is written do not matter. Two date-times compare as
text only when they are written alike, and `"2027-03-15T15:00:00.000Z"`, as
JavaScript's `toISOString()` writes every time, sorts before `"2027-03-15T15:00:00Z"` as
text though it is the same instant. A date is its midnight in UTC.

### Examples

```quillo
let a = "2027-03-15T15:00:00Z"
print(date.compare(a, "2027-03-15T15:00:00.000Z"), date.compare("2027-03-15T16:00:00+01:00", a))
print(date.compare("2027-03-15T15:00:00.500Z", a), date.compare("2027-03-15", a))
```

```output
0 0
1 -1
```

### Edge cases

- To sort date-times, sort by `date.ms`, which gives the same order:
  `sort_by(times, (t) => date.ms(t))`.
- Fractions are compared to the nanosecond.

```quillo
print(sort_by(["2027-03-15T15:00:00.500Z", "2027-03-15T15:00:00Z"], (t) => date.ms(t)))
print(date.compare("2027-03-15T15:00:00.123456789Z", "2027-03-15T15:00:00.123456788Z"))
```

```output
["2027-03-15T15:00:00Z", "2027-03-15T15:00:00.500Z"]
1
```

### Errors

Text that is neither a date nor a date-time is a runtime error.

```quillo error
date.compare("tomorrow", "2027-03-15")
```

```output
line 1: `date.compare` expects a date or a date-time as argument 1, got "tomorrow"
```

### Chaining

```quillo
print("2027-03-15T15:00:00Z" | date.compare("2027-03-15T14:00:00Z"))
```

```output
1
```

### See also

[date.ms](/docs/reference/date.ms/), [date.to_zone](/docs/reference/date.to_zone/), [date.parse](/docs/reference/date.parse/)
