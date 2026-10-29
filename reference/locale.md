# locale
locale() -> str | null
group: Translations

### What it does

The locale the code runs in, as named in `translations`: `"en"`, `"pt-BR"`. In a
request it is what `locale_from` gives, else the `locale` cookie, else the best match
of `Accept-Language` (`fr-CA` is served by `fr`, `pt` by `pt-BR`), else the default
locale; inside `with_locale` it is that locale. Outside a request it is the default.
Without `translations` it is `null`.

### Examples

```quillo
print(locale())
translations({ en: { a: "b" }, fr: { a: "c" } })
print(locale())
print(with_locale("fr", () => locale()))
```

```output
null
en
fr
```

### Edge cases

- `null` before `translations`, never an empty string.
- The default is what `{ default: ... }` names, else `en` when there is one, else the
  first locale: the first written in a map, the first by name in a folder.
- Inside `with_locale` the name is the locale's own: `with_locale("fr-CA", ...)` served
  by `fr` reports `"fr"`.
- A request's locale is settled on its first use and stays for the request.

```quillo
translations({ fr: { a: "x" }, de: { a: "y" } })
print(locale())
translations({ en: { a: "b" }, fr: { a: "c" } })
print(with_locale("fr-CA", () => locale()), with_locale("de", () => locale()))
print(locale() == "en")
```

```output
fr
fr en
true
```

### Errors

None: `locale` takes no arguments and never fails. What it gives is `null` or a
string, so a program that may run without translations gives it a default.

```quillo
print(locale() ?? "en")
```

```output
en
```

### Chaining

It is a value to pass on: to `format_number`, `date.format` or `money.format`, which
use the program's locale when none is given, or to pick a file.

```quillo
translations({ "en-IN": { a: "b" } })
print(format_number(1234567.5, locale()))
print(`/help/${locale()}.html`)
```

```output
12,34,567.5
/help/en-IN.html
```

```quillo noexec
route GET / = <html lang={locale()}><body>{t("welcome")}</body></html>
```

### See also

[translations](/docs/reference/translations/), [t](/docs/reference/t/), [locale_from](/docs/reference/locale_from/), [with_locale](/docs/reference/with_locale/), [format_number](/docs/reference/format_number/)
