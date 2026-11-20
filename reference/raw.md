# raw
raw(any) -> html
group: Markup

### What it does

Marks text as trusted HTML: the result is an `html` value, which markup writes as it
is instead of escaping it. Use it for HTML you made yourself or stored from `markdown`,
never for what a visitor typed. Any value is taken; its text is what `str` gives.
`raw(t(key, vars))` is a special form: the translation's markup is kept and the values
put into it are escaped; a key no locale has is written as escaped text, and a URL
attribute a value makes a `javascript:` one is `about:blank#blocked` *(since 0.8.9; see
[t](/docs/reference/t/))*.

### Examples

```quillo
let h = raw("<b>bold</b>")
print(h, str(h))
print(raw(42), raw(true))
```

```output
<b>bold</b> <b>bold</b>
42 true
```

### Edge cases

- An `html` value is not equal to a string with the same text; `str(...)` is.
- `raw` of an `html` value (`markdown`'s result) is the same value.
- `escape` turns it back into text: `escape(raw(x))` shows the tags.
- `null` gives the text `null`, not an empty value.
- Inside `<script>{...}</script>`, an `html` value goes in as it is except that `</`
  becomes `<\/` and `<!--` becomes `<\!--`, so it cannot end the element early. Inside
  `<svg>` or `<math>`, where the browser reads a script's text as markup, it goes in a
  CDATA section, a `]]>` in it split between two *(since 0.8.7: its markup reached the
  page)*; markup made apart and placed there later is written so too. Write `<script>`
  and `<style>` in lower case: `<sCript>` is refused where the program is read *(since
  0.8.7)*.
- Markup given as text (`raw(...)`) is read as the browser reads it, to tell whether a
  script after it is in SVG or MathML or in HTML. Attributes may be unquoted or quoted
  either way (`<font size=1>` ends SVG, as `<p>` does). A `/>` closes only a void element
  (`<br/>`) or an SVG or MathML one (`<circle/>`): `<div/>` stays open as `<div>` does. A
  comment ends at the first `-->` or `--!>`, and an end tag ends the element it names and
  those open inside it, as the browser's parser does *(since 0.8.8: Quillo read such
  markup otherwise than the browser in places, and a script the browser reads as SVG could
  be written for HTML; `raw("<font size=1>")` inside `<svg>` hung its request)*.
- Where Quillo cannot tell where the browser is (a `</div>` that names nothing open, a
  `<table>`, an `<svg>` or `<math>` left open, a second `<li>` or `<p>` that closes the
  first), every later script on that page is written in the form safe in both readings,
  the page's deferred parts' too, and an empty `<span></span>`, which ends SVG and MathML
  wherever the browser is, goes before its `</body>` (and after a deferred part that lost
  the place), so that what Quillo writes after the page is read as HTML *(since 0.8.8)*.
- Markup inside `<svg>` or `<math>` that stops partway (`raw("<!-- x")`,
  `raw("<a href='x")`, a `<script>` with no `</script>`, a last `<`) has its end written
  (`-->`, `'>`, `</script>`, `&lt;`), so the browser never reads on into the page's next
  markup. A comment, tag or script split over two `raw` values is therefore ended after
  the first, and the server log says so once for each line: give the whole of it in one
  `raw` *(since 0.8.8)*.
- HTML a visitor wrote, even cleaned by a sanitizer, must not keep the attributes
  Quillo's islands are made of, `data-qi`, `data-qd`, `data-qt`, `data-c`, `data-p`,
  `data-s`, `data-l`, `data-v` and `data-e`, nor `<quillo-island>` elements: the page
  takes such an element up as one of its components, with the props and state it says. DOMPurify keeps `data-*` unless told
  not to (`ALLOW_DATA_ATTR: false`).

```quillo
print(raw("x") == "x", str(raw("x")) == "x")
print(raw(markdown("*a*")) == markdown("*a*"))
print(escape(raw("<b>")))
print(raw(null), raw(""))
translations({ en: { welcome: "Welcome, <b>{name}</b>" } })
print(raw(t("welcome", { name: "<i>Ada</i>" })))
```

```output
false true
true
&lt;b&gt;
null 
Welcome, <b>&lt;i&gt;Ada&lt;/i&gt;</b>
```

```quillo
print(<svg>{raw("<!-- x")}</svg>)
print(<svg>{raw("<a href='x")}</svg>)
```

```output
<svg><!-- x--></svg>
<svg><a href='x'></svg>
```

### Errors

None: every value has a text, so `raw` never fails and never gives an error value.
What it marks is trusted, so the error to avoid is a visitor's text in it.

```quillo
print(raw(err("x")))
```

```output
err("x")
```

### Chaining

```quillo
print(["<li>a</li>", "<li>b</li>"] | join("") | raw)
let safe = "<b>" | escape | raw
print(safe)
```

```output
<li>a</li><li>b</li>
&lt;b&gt;
```

```quillo noexec
view Post(p) = <article>
    <h2>{p.title}</h2>
    {raw(p.body_html)}
</article>
```

### See also

[escape](/docs/reference/escape/), [markdown](/docs/reference/markdown/), [highlight](/docs/reference/highlight/), [t](/docs/reference/t/)
