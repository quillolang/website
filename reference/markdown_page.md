# markdown_page
markdown_page(str, map | null=) -> html
group: Markup

### What it does

Markdown text as a whole HTML page, for a route to answer with: what `markdown` makes,
inside a doctype, an `<html>`, and a `<head>` with `<meta charset="utf-8">`, a viewport
and a `<title>`. A fragment from `markdown` has none of these, so a browser shows it in
quirks mode. The title is the `title` option, or else the text of the first `# ` heading,
or else empty. The options are `title`, `lang` (a language tag, written on `<html>`) and
`html`, which keeps HTML written in the text, as `markdown`'s does.

### Examples

```quillo noexec
route GET /notes = markdown_page(read_file("notes.md")?)
route GET /about = markdown_page(read_file("about.md")?, { title: "About us", lang: "en" })
```

```quillo
print(markdown_page("# Notes\n\nSome *text*."))
print(markdown_page("no heading", { title: "Notes", lang: "en" }))
```

```output
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Notes</title></head><body><h1>Notes</h1>
<p>Some <em>text</em>.</p>
</body></html>
<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Notes</title></head><body><p>no heading</p>
</body></html>
```

### Edge cases

- HTML in the text is shown as text unless `html: true`, as with `markdown`; the title
  is escaped either way.
- The page links no style sheet. For one, put `markdown(...)` inside a view of your own
  with its `<head>`.
- The result is an `html` value: a route answers it as `text/html`.

```quillo
print(markdown_page("<b>x</b>"))
print(markdown_page("<b>x</b>", { html: true, title: "<b>" }))
print(type_of(markdown_page("")))
```

```output
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title></title></head><body><p>&lt;b&gt;x&lt;/b&gt;</p>
</body></html>
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>&lt;b&gt;</title></head><body><p><b>x</b></p>
</body></html>
html
```

### Errors

An option it does not take, a title that is not a str, a `lang` that is not a
language tag, or options that are not a map, are runtime errors, not error values.

```quillo error
print(markdown_page("x", { titel: "a" }))
```

```output
line 1: `markdown_page` has no option `titel`: it takes `title`, `lang` and `html`
```

```quillo error
print(markdown_page("x", { lang: "en us" }))
```

```output
line 1: `markdown_page`'s lang is a language tag such as "en", got "en us"
```

### Chaining

The text comes first, so a file read in a pipeline goes straight in:

```quillo
write_file("notes.md", "# Today\n\n- milk")?
print(read_file("notes.md")? | markdown_page({ lang: "en" }) | str | len)
```

```output
214
```

### See also

[markdown](/docs/reference/markdown/), [files](/docs/reference/files/), [read_file](/docs/reference/read_file/), [highlight](/docs/reference/highlight/)
