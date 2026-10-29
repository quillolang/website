# raw
raw(any) -> html
group: Markup

### What it does

Marks text as trusted HTML: the result is an `html` value, which markup writes as it
is instead of escaping it. Use it for HTML you made yourself or stored from `markdown`,
never for what a visitor typed. Any value is taken; its text is what `str` gives.
`raw(t(key, vars))` is a special form: the translation's markup is kept and the values
put into it are escaped.

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
  becomes `<\/` and `<!--` becomes `<\!--`, so it cannot end the element early.

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
