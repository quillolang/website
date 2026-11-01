# date.valid_zone
date.valid_zone(any) -> bool
group: Dates

### What it does

Whether a value is a time zone: a name, as `"Europe/Paris"`, an offset, as `"+05:45"`, or
`"UTC"`. A zone is among the commonest values a program takes from a person, and one that does
not exist stops `date.to_zone`, so ask first, or guard it with `??`.

### Examples

```quillo
print(date.valid_zone("Europe/Paris"))
print(date.valid_zone("+05:45"))
print(date.valid_zone("Mars/Base"))
print(date.to_zone("2026-10-27T14:30:00Z", "Mars/Base") ?? "no such zone")
```

```output
true
true
false
no such zone
```
