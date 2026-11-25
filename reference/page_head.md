# page_head
page_head(map) -> null
group: Browser

### What it does

Sets the head of the page it is called in *(since 0.8.11)*: `{ title, description, image,
canonical }` give `<title>` and `og:title`, the description and `og:description`,
`og:image`, and the canonical link with `og:url`. A layout, a page inside it, or a
component deep in the page may call it, and the innermost call wins, key by key; what it
leaves out stays the outer call's, or the head's own.

### Examples

```quillo noexec
view Layout(title: str, children) {
    page_head({ title: `${title} · Shop`, description: "Teapots and kettles" })
    return <html lang="en">
        <head><meta charset="utf-8"/><title>Shop</title></head>
        <body>{children}</body>
    </html>
}

view Teapot(id: int) {
    page_head({ title: `Teapot ${id} · Shop`, image: "/img/teapot.png", canonical: `/teapots/${id}` })
    return <article><h1>Teapot {id}</h1></article>
}

route GET /teapots/:id(int) = <Layout title="Teapots"><Teapot id={id}/></Layout>
```

`/teapots/2` is sent with `<title>Teapot 2 · Shop</title>`, the layout's description, and
`og:image` and the canonical link as whole addresses (see [page_url](/docs/reference/page_url/)).

### Edge cases

- The values are text, escaped; `null` says nothing (the outer value stands). `image` and
  `canonical` take a path starting with `/` or an `http(s)://` address; `javascript:` and
  `data:` are refused. Any other key is an error that names it (`` `page_head` has no key
  `titel`: it takes title, description, image and canonical ``).
- On the server it writes the head the page is sent with, so a link's preview and a search
  engine read it. In the browser it follows state: `page_head({ title: `${n} unread` })`
  changes the tab's title as `n` changes, and when the component goes, its values go too.
- The tags go where the browser reads the head, before the head's first `<noscript>`; a
  page with no `<head>` gets them where the browser makes its head, and a part of a page (a
  route that gives an `<li>`) gets nothing.
- In a deferred part (`state x = defer(...)`), it reaches the browser only, after the page
  is sent.
- A component inside `<head>` is an error in `quillo check`; call `page_head` from it
  instead. A program's own function named `page_head` hides the builtin, with a warning.
