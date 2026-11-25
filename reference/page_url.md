# page_url
page_url(str | null=) -> str
group: Browser

### What it does

The page's public address *(since 0.8.11)*: `page_url()` is the page's own,
`page_url("/img/card.png")` another path's, with the scheme, the host, the `--base`
prefix and the path, for an `og:url`, a share link or an email.

### Examples

```quillo noexec
route GET /posts/:id(int) = <html>
    <head><meta property="og:url" content={page_url()}/></head>
    <body><a href={page_url("/img/card.png")}>Card</a></body>
</html>
```

### Edge cases

- The scheme is `https` only behind a proxy `--trust-proxy` names (or FastCGI's word), as
  a visitor's `X-Forwarded-Proto` is not taken; the host is the first name of
  `--allowed-hosts` when it is given, else the request's.
- An address that is already whole is given back as it is; a path that does not start
  with `/`, and `//host`, are errors.
- In a plain program, with no request, the host is `localhost`.
- A program's own function named `page_url` hides the builtin, with a warning.

```quillo
print(page_url())
print(page_url("/img/card.png"))
print(page_url("https://cdn.example/a.png"))
```

```output
http://localhost/
http://localhost/img/card.png
https://cdn.example/a.png
```
