# local_path
local_path(any) -> str | null
group: Requests and pages

### What it does

`next` if it is an address on this site, read as a browser reads it, else null. A
sign-in page sends the visitor back to where they were, `/login?next=/orders/7`, and a
check that `next` starts with `/` and not `//` lets `/\evil.example` through: browsers
read `\` as `/`, and drop tabs and line breaks from an address. `local_path` reads it the
same way and refuses anything with a scheme or a host, so
`redirect(local_path(next) ?? "/")` cannot send a visitor to another site.

### Examples

```quillo noexec
route POST /login { form: { email: str, password: str, next: str = "/" } } {
    sign_in(email, password)?
    redirect(local_path(next) ?? "/")
}
```

```quillo
for n in ["/orders/7?tab=paid", "//evil.example", "/\\evil.example", "/\t/evil.example", "https://evil.example", "javascript:alert(1)", "orders"] {
    print(json.stringify(n), local_path(n))
}
```

```output
"/orders/7?tab=paid" /orders/7?tab=paid
"//evil.example" null
"/\\evil.example" null
"/\t/evil.example" null
"https://evil.example" null
"javascript:alert(1)" null
"orders" null
```

### Edge cases

- Spaces around the address are dropped; a query and a fragment are kept.
- `/%2F` and `/%5C` at the start are refused too, as some servers decode them to `//`.
- Anything that is not text is null, so a missing form field needs no check of its own.
  It runs the same in the browser.

```quillo
print(local_path(" /a#b "), local_path("/%2F/evil"), local_path(null), local_path(3))
```

```output
/a#b null null null
```

### Errors

None: what is not an address on the site is null.

### Chaining

```quillo
print("/me" | local_path() ?? "/")
```

```output
/me
```

### See also

[redirect](/docs/reference/redirect/), [url_encode](/docs/reference/url_encode/), [set_session](/docs/reference/set_session/)
