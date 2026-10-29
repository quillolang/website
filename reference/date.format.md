# date.format
date.format(str, str | map) -> str
group: Dates

### What it does

A date or a date-time as text, by a pattern or in a locale's style. The pattern's tokens
are `YYYY` and `YY` (the year), `MMMM`, `MMM`, `MM` and `M` (the month's name, short
name, number padded or not), `DD` and `D`, `dddd` and `ddd` (the weekday's name),
`HH`, `H`, `hh` and `h` (24 or 12 hours), `mm`, `ss`, `A` (AM or PM) and `Z` (the
offset); anything else, and text in `[brackets]`, is kept as it is. A map `{ locale,
style }` gives that locale's `"short"`, `"medium"` (the default), `"long"` or `"full"`
date, and `{ locale, pattern }` the pattern with that language's names. The locales are
English (US; British style for `en-GB`, `en-AU`, `en-IE`, `en-NZ`, `en-IN`, `en-ZA`),
German, French, Spanish, Italian, Dutch and Portuguese; any other is English.

### Examples

```quillo
print(date.format("2026-10-27", "DD/MM/YYYY"), date.format("2026-10-27", "dddd, MMMM D, YYYY"))
print(date.format("2026-10-27T14:30:05+01:00", "YYYY-MM-DD HH:mm:ss Z"), date.format("2026-10-27T14:30:05Z", "h:mm A"))
print(date.format("2026-10-27", { locale: "de-DE", style: "long" }), date.format("2026-10-27", { locale: "fr", style: "full" }))
print(date.format("2026-10-27", { locale: "fr", pattern: "dddd D MMMM YYYY" }))
```

```output
27/10/2026 Tuesday, October 27, 2026
2026-10-27 14:30:05 +01:00 2:30 PM
27. Oktober 2026 mardi 27 octobre 2026
mardi 27 octobre 2026
```

### Edge cases

- A date-time shows its time as written: `date.to_zone` it first to show another zone's.
- `h` and `hh` run 12 to 11: midnight is `12 AM`, noon `12 PM`.
- Brackets protect text that looks like tokens; an unclosed `[` keeps the rest of the
  pattern as it is. Letters that are no token (`Today:`) pass through, so take care
  with words that hold `D`, `M`, `H` or `A`.
- Tokens are read longest first: `MMMMM` is `MMMM` then `M`.
- A locale's case and separator do not matter (`DE_de`); an unknown locale is
  English; a language without a region (`de`) uses the language's forms, and `pt-BR`
  is Portuguese.
- `pattern` wins over `style` when both are given; an empty map is the medium English
  style.

```quillo
print(date.format("2026-10-27T14:30:00Z", "HH:mm Z"), date.format(date.to_zone("2026-10-27T14:30:00Z", "Asia/Tokyo"), "HH:mm Z"))
print(date.format("2026-10-27T00:05:00Z", "hh:mm A"), date.format("2026-10-27T12:05:00Z", "h A"))
print(date.format("2026-10-27", "[Day] D [of] MMMM"), date.format("2026-10-27", "[unclosed"), date.format("2026-10-27", "Today: D"))
print(date.format("2026-10-27", "MMMMM"), date.format("2026-10-27", { locale: "DE_de", style: "short" }), date.format("2026-10-27", { locale: "ja-JP", style: "long" }))
print(date.format("2026-10-27", { locale: "pt-BR", style: "long" }), date.format("2026-10-27", { pattern: "D MMMM", style: "full" }), date.format("2026-10-27", {}))
print(date.format("2026-10-27", { locale: "en-GB", style: "short" }), date.format("2026-10-27", { style: "short" }))
```

```output
14:30 Z 23:30 +09:00
12:05 AM 12 PM
Day 27 of October unclosed Today: 27
October10 27.10.26 October 27, 2026
27 de outubro de 2026 27 October Oct 27, 2026
27/10/2026 10/27/26
```

### Errors

A pattern with a time token (`HH`, `mm`, `A`, `Z`...) on a date, which has no time, is a
runtime error, as are text that is not a date or a date-time, a second argument that is
neither a string nor a map, a style that is not one of the four, and an option other
than `locale`, `style` and `pattern`. None is an error value.

```quillo error
print(date.format("2026-10-27", "HH:mm"))
```

```output
line 1: `date.format`: the pattern has a time (HH), but "2026-10-27" is a date
```

```quillo error
print(date.format("2026-10-27", { locale: "de", style: "tiny" }))
```

```output
line 1: `date.format`: style is short, medium, long or full, got "tiny"
```

### Chaining

The date comes first in a pipeline, and what `date.format` writes `date.parse` reads
back with the same pattern:

```quillo
print("2026-10-27" | date.add_days(3) | date.format("ddd D MMM"))
print("2026-10-27" | date.format("DD/MM/YYYY") | date.parse("DD/MM/YYYY"))
print(["2026-10-27", "2026-12-25"] | map((d) => date.format(d, { locale: "es", style: "long" })))
```

```output
Fri 30 Oct
2026-10-27
["27 de octubre de 2026", "25 de diciembre de 2026"]
```

### See also

[date.parse](/docs/reference/date.parse/), [date.to_zone](/docs/reference/date.to_zone/), [date.parts](/docs/reference/date.parts/), [date.weekday](/docs/reference/date.weekday/), [money.format](/docs/reference/money.format/), [locale](/docs/reference/locale/)
