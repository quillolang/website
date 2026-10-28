---
title: Speaking every language, with plurals right
date: 2026-01-25
summary: "1 items" is the most common translation bug on the web. Plural rules per language, built in, make t() say the right thing in Polish and Arabic too.
tags: i18n, features
---
Translating a site looks like a lookup: a key, a string per language. Then the first count arrives. English has two forms (one item, two items). French says "0 article". Polish has three forms, Arabic six. A translation library that only knows "one" and "other" is wrong in most of the world.

### Translations in Quillo

```quillo
translations("locales")          // locales/en.json, locales/fr.json, locales/pt-BR.json

view Header(user) = <header>
    <a href="/">{t("nav.home")}</a>
    <span>{t("greeting", { name: user.name })}</span>
    <span>{t("cart.items", { count: len(user.cart) })}</span>
</header>
```

```json
{ "nav": { "home": "Accueil" },
  "greeting": "Bonjour, {name} !",
  "cart": { "items": { "one": "{count} article", "other": "{count} articles" } } }
```

A key with plural forms (`zero one two few many other`) is picked by `count`, using the language's own rules, which are built in: French and Portuguese treat 0 as singular, Russian and Polish have their few and many, Japanese and Chinese have one form.

### Which language

A request's language comes from, in order: your own choice (`locale_from`, a user's setting), a `locale` cookie, the browser's `Accept-Language`, then the default. `fr-CA` is served by `fr`, `pt` by `pt-BR`. A key missing in a language falls back to the default one, so a half-translated site still reads.

### On both sides

`t()` works on the server and in components alike, from the same files, so a counter in the browser says "3 articles" with the same rules the server used.

> **Read more:** [Translations](/docs/routes/#translations) in the docs.
