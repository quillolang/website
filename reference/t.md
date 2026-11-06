# t
t(str, map | null=) -> str
group: Translations

### What it does

The key's text in the current locale, from the program's `translations`. `{name}` in
the text is replaced by that value from the map; an entry of plural forms picks the
form for `count` by the locale's rules. A key missing in the locale comes from the
default locale, and a key missing there shows as itself. The text is escaped in
markup like any other; `raw(t(...))` keeps markup written in the translation while
still escaping the values put in.

### Examples

```quillo
translations({
    en: { greeting: "Hello, {name}!", nav: { home: "Home" }, items: { one: "{count} item", other: "{count} items" } },
    fr: { greeting: "Bonjour, {name} !", nav: { home: "Accueil" }, items: { one: "{count} article", other: "{count} articles" } },
})
print(t("nav.home"))
print(t("greeting", { name: "Ada" }))
print(t("items", { count: 1 }), "|", t("items", { count: 0 }), "|", t("items", { count: 2 }))
print(with_locale("fr", () => t("greeting", { name: "Ada" })))
```

```output
Home
Hello, Ada!
1 item | 0 items | 2 items
Bonjour, Ada !
```

### Edge cases

- A missing key is the key itself, with no error; a key of a nested map, not a leaf,
  is the same.
- A `{name}` with no value in the map stays as written; a value that is null shows as
  `null`. Other braces are left alone.
- The form is CLDR 47's for the number as `{count}` shows it, read from its digits
  (CLDR's operands: the whole part, and the fraction's digits with and without their
  trailing zeros), the same on the server and in the browser, for about 110 languages
  (old codes `iw`, `jw`, `tl` too); the sign is ignored. So a fraction is not one rule
  for all: `1.5` and `0.5` are `one` in French, `"1.0"` is `one` in Spanish and `other`
  in English ("1.0 items"), and `2.0` is `two` in Arabic. `fr` has `one` for 0 and 1,
  `ru` has `one`, `few` and `many`, `ja` has `other` alone.
- A whole float shows as a route writes it, `1.0`, so it takes `other` in English
  there, and as a component writes it, `1`, so it takes `one` there, on both sides
  alike. A decimal keeps its digits: `1.0m` is "1.0 items".
- A `zero` form, where one is written, is used for a 0 shown with no point (`0`, not
  `0.0`), in every language.
- `count` may be numeric text (`"1"`, as a query or a form gives it): `"1e3"` is 1000,
  and `"0x1"`, `"Infinity"` and full-width digits are not numbers, on either side, and
  take `other`.
- A key missing in the locale falls back to the default locale's text.
- `raw(t(...))` escapes the values but not the translation.

```quillo
translations({
    en: { greeting: "Hello, {name}!", only_en: "English only", welcome: "Welcome, <b>{name}</b>", nav: { home: "Home" } },
    fr: { greeting: "Bonjour, {name} !" },
    ru: { n: { one: "{count} день", few: "{count} дня", many: "{count} дней", other: "{count} дня" } },
})
print(t("missing.key"), t("nav"))
print(t("greeting"), t("greeting", { name: null }), t("greeting", { other: 1 }))
print(with_locale("fr", () => t("only_en")))
print(with_locale("ru", () => [1, 2, 5, 21, 1.5] | map((c) => t("n", { count: c }))))
print(raw(t("welcome", { name: "<i>Ada</i>" })))
translations({
    en: { items: { zero: "no items", one: "{count} item", other: "{count} items" } },
    fr: { items: { one: "{count} article", other: "{count} articles" } },
})
print([1, 1.0, "1.0", 0, 0.0, "1e3", "0x1"] | map((c) => t("items", { count: c })))
print(with_locale("fr", () => [1.5, 0.5, 2] | map((c) => t("items", { count: c }))))
```

```output
missing.key nav
Hello, {name}! Hello, null! Hello, {name}!
English only
["1 день", "2 дня", "5 дней", "21 день", "1.5 дня"]
Welcome, <b>&lt;i&gt;Ada&lt;/i&gt;</b>
["1 item", "1.0 items", "1.0 items", "no items", "0.0 items", "1e3 items", "0x1 items"]
["1.5 article", "0.5 article", "2 articles"]
```

### Errors

Calling `t` before `translations` is a runtime error, not an error value, and so is a
key that is not a string or values that are not a map (`null` is fine).

```quillo error
print(t("hello"))
```

```output
line 1: `t` needs `translations` first
```

```quillo error
translations({ en: { a: "b" } })
print(t("a", "Ada"))
```

```output
line 2: `t` expects its values as a map, got str
```

### Chaining

The key comes first in a pipeline, so the values are the only argument written. In
markup `t` reads well on its own; a list of keys maps over it.

```quillo
translations({ en: { yes: "Yes", no: "No", hi: "Hi, {name}" } })
print("hi" | t({ name: "Ada" }))
print(["yes", "no"] | map(t))
```

```output
Hi, Ada
["Yes", "No"]
```

```quillo noexec
view Header(user) = <header>
    <a href="/">{t("nav.home")}</a>
    <span>{t("greeting", { name: user.name })}</span>
</header>
```

### See also

[translations](/docs/reference/translations/), [locale](/docs/reference/locale/), [with_locale](/docs/reference/with_locale/), [raw](/docs/reference/raw/), [format_number](/docs/reference/format_number/)
