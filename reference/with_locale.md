# with_locale
with_locale(str, fn) -> any
group: Translations

### What it does

Runs a function in another locale and gives what the function gives: `t` and
`locale` inside it use that locale, and the request's own locale is back afterwards.
For an email in the recipient's language, or a page that shows two. The name is
matched as `Accept-Language` is: `fr-CA` is served by `fr`, `pt` by `pt-BR`, without
regard to case; a name no locale serves runs the function in the default locale.

### Examples

```quillo
translations({
    en: { bye: "Goodbye, {name}" },
    fr: { bye: "Au revoir, {name}" },
})
print(with_locale("fr", () => t("bye", { name: "Ada" })))
print(with_locale("fr", () => [locale(), t("bye", { name: "Ada" })]))
print(locale())
```

```output
Au revoir, Ada
["fr", "Au revoir, Ada"]
en
```

### Edge cases

- The function's value comes back as it is, of any type; a function that takes no
  arguments is called with none.
- Calls nest: the inner locale wins inside, the outer is back after it.
- An unknown locale, or `""`, runs the function in the default locale; `fr_FR` with an
  underscore is `fr`.
- A program's own named function works as the function.

```quillo
translations({ en: { a: "b" }, fr: { a: "c" } })
print(with_locale("fr", () => 42))
print(with_locale("fr", () => with_locale("en", () => t("a")) + t("a")))
print(with_locale("de", () => locale()), with_locale("", () => locale()), with_locale("fr_FR", () => locale()))
fn greet() = t("a")
print(with_locale("FR", greet))
```

```output
42
bc
en en fr
c
```

### Errors

Calling it before `translations` is a runtime error, not an error value; so is a name
that is not a string, a missing function, or a second argument that cannot be called.
An error the function raises is the caller's, and the locale is restored.

```quillo error
print(with_locale("fr", () => 1))
```

```output
line 1: `with_locale` needs `translations` first
```

```quillo error
translations({ en: { a: "b" } })
print(with_locale("en"))
```

```output
line 2: `with_locale` needs a function to run
```

### Chaining

The locale comes first, so in a pipeline the function is the only argument written;
more often the call wraps a block, and a list of locales maps over it.

```quillo
translations({ en: { a: "Hello" }, fr: { a: "Bonjour" }, de: { a: "Hallo" } })
print("fr" | with_locale(() => t("a")))
print(["en", "fr", "de"] | map((l) => with_locale(l, () => t("a"))))
```

```output
Bonjour
["Hello", "Bonjour", "Hallo"]
```

```quillo noexec
fn welcome_email(user) = with_locale(user.locale, () => {
    let subject = t("email.welcome.subject")
    let body = t("email.welcome.body", { name: user.name })
    { subject, body }
})
```

### See also

[translations](/docs/reference/translations/), [t](/docs/reference/t/), [locale](/docs/reference/locale/), [locale_from](/docs/reference/locale_from/)
