# date.valid_zone
date.valid_zone(any) -> bool
group: Dates

### What it does

Whether a value is a time zone: a name of the IANA database, a zone or a link, in any
case (`"Europe/Paris"`, `"US/Pacific"`, `"EST"`), an offset as `date.parse` reads one
(`"+05:45"`, `"+0530"`, `"+05"`, up to `+23:59`), or `"UTC"`. The server and the
browser take the same zones and refuse the same names. A zone is among the commonest values a program takes from a person, and one that does
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

### Edge cases

- Names some systems keep beside the database are no zones, on either side:
  `posixrules`, `Factory`, `Etc/Unknown`, `localtime`, `posix/...` and `right/...`.
- So are names the database dropped (`US/Pacific-New`, `Canada/East-Saskatchewan`,
  `SystemV/...`), Java's three-letter ids (`PST`), and any other name with a sign
  (`+5`, `+0560`, `+24:00`, a U+2212 minus).
- The server reads the system's time zone database, and a copy built into `quillo` for
  a name the system's leaves out, or where there is none (Windows, small containers);
  the browser asks its own (`Intl`). So `EST`, `US/Pacific`, `Asia/Calcutta` and
  `EST5EDT`, which Ubuntu 24.04 moved to a package of their own (tzdata-legacy), are
  zones on every machine.

```quillo
print(["europe/paris", "US/Pacific", "EST", "+0530", "+05", "+23:59"] | map(date.valid_zone))
print(["PST", "posixrules", "Factory", "right/UTC", "US/Pacific-New", "+5", "+24:00"] | map(date.valid_zone))
print(date.from_ms(1793543400000, "+0530"), date.to_zone("2026-10-27T14:30:00Z", "europe/paris"))
```

```output
[true, true, true, true, true, true]
[false, false, false, false, false, false, false]
2026-11-01T20:00:00+05:30 2026-10-27T15:30:00+01:00
```
