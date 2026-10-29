# translations
translations(str | map, map | null=) -> null
group: Translations

### What it does

Declares the program's translations, at the top of the program, for `t` and `locale`.
A folder name reads `<dir>/<locale>.json`, one JSON object per locale, the locale
named as `en`, `pt-BR` or `zh-Hant`; a map takes the text directly, `{ en: {...},
fr: {...} }`. Nested maps become dotted keys (`nav.home`), and a map whose keys are
plural forms (`zero one two few many other`, with `other` present) is one entry
chosen by `count`. The default locale is the option `{ default: "en" }`, else `en`
when there is one, else the first locale by name; a key missing in a locale comes
from it.

### Examples

```quillo
translations({
    en: { nav: { home: "Home" }, items: { one: "{count} item", other: "{count} items" } },
    fr: { nav: { home: "Accueil" }, items: { one: "{count} article", other: "{count} articles" } },
})
print(locale(), t("nav.home"), t("items", { count: 2 }))
print(with_locale("fr", () => t("items", { count: 2 })))
```

```output
en Home 2 items
2 articles
```

```quillo noexec
translations("locales")                     // locales/en.json, locales/fr.json, locales/pt-BR.json
translations("locales", { default: "fr" })
```

### Edge cases

- Without `en` and without a default given, the first locale is the default: the
  first written in a map, the first by name in a folder. The default's name is
  matched without regard to case.
- Calling it again replaces the translations; the last call counts.
- A plural map needs `other`; a map with `one` alone is nested keys (`n.one`), not a
  plural entry.
- A folder path is relative to the program's folder and must stay inside it.
- It gives `null`.

```quillo
translations({ fr: { a: "fr" }, de: { a: "de" } })
print(locale())
translations({ fr: { a: "fr" }, de: { a: "de" } }, { default: "FR" })
print(locale(), t("a"))
translations({ en: { n: { one: "one" } } })
print(t("n", { count: 1 }), t("n.one"))
print(translations({ en: { a: "b" } }))
```

```output
fr
fr fr
n one
null
```

### Errors

A bad declaration is a runtime error, not an error value: a locale name that is not
one, a locale that is not a map, an entry that is not text or a map, plural forms
that are not text, no locales at all, a default that is not among them, a folder
that cannot be read or that leaves the program's folder.

```quillo error
translations({ english: { a: "b" } })
```

```output
line 1: `translations`: "english" is not a locale name such as "en" or "pt-BR"
```

```quillo error
translations({ en: { a: 1 } })
```

```output
line 1: `translations` (en): `a` must be text or a map, not int
```

```quillo error
translations({ en: { a: "b" } }, { default: "fr" })
```

```output
line 1: `translations`: the default "fr" is not among the locales
```

```quillo error
translations("../locales")
```

```output
line 1: `translations` needs a folder inside the program's, got "../locales"
```

### Chaining

It is a declaration, not a value: call it once at the top of the program, before the
routes. `t`, `locale` and `with_locale` then work in any function a request runs,
and in components, which carry their locale's text to the browser.

```quillo noexec
translations("locales")
locale_from((request) => request.query.lang)

route GET / = <h1>{t("welcome")}</h1>
```

### See also

[t](/docs/reference/t/), [locale](/docs/reference/locale/), [locale_from](/docs/reference/locale_from/), [with_locale](/docs/reference/with_locale/)
