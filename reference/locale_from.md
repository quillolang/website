# locale_from
locale_from(fn) -> null
group: Translations

### What it does

Declares how a request's locale is chosen: the function is given the request and
gives a locale name (a query parameter, a signed-in user's setting), which is matched
to the program's `translations` as `Accept-Language` is (`fr-CA` is served by `fr`).
Anything else than a name that matches (`null`, an unknown locale) falls through to
the usual choice: the `locale` cookie, then `Accept-Language`, then the default.
Declare it at the top of the program, after `translations`.

### Examples

```quillo noexec
translations("locales")
locale_from((request) => request.query.lang)

route GET /settings/lang/:code {
    set_cookie("locale", code)
    redirect("/")
}
```

```quillo
translations({ en: { a: "b" }, fr: { a: "c" } })
print(locale_from((request) => request.query.lang))
print(locale(), t("a"))
```

```output
null
en b
```

### Edge cases

- Outside a request the rule is not consulted: `locale()` is the default locale, and
  `with_locale` sets it directly.
- The function is called once per request, on the first use of `t` or `locale`, and
  its answer is kept for the request.
- Declaring it again replaces the rule; declaring it before `translations` is fine,
  since it is only read in a request.
- It gives `null`.

```quillo
print(locale_from((request) => "fr"))
translations({ en: { a: "b" }, fr: { a: "c" } })
print(locale(), t("a"))
print(with_locale("fr", () => t("a")))
```

```output
null
en b
c
```

### Errors

A value that is not a function is a runtime error, not an error value. A function
that fails inside a request, or gives something that is not a string, counts as no
answer: the usual choice is made.

```quillo error
locale_from("fr")
```

```output
line 1: `locale_from` expects a function of the request, got str
```

### Chaining

It is a declaration, not a value, so it does not take part in pipelines. A rule that
looks at a user reads the session:

```quillo noexec
translations("locales")
locale_from((request) => request.query.lang ?? session().user.locale)
```

### See also

[translations](/docs/reference/translations/), [locale](/docs/reference/locale/), [with_locale](/docs/reference/with_locale/), [t](/docs/reference/t/), [set_cookie](/docs/reference/set_cookie/)
