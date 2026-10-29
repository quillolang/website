# escape
escape(any) -> str
group: Markup

### What it does

The value's text with `& < > " '` written as entities (`&amp; &lt; &gt; &quot;
&#39;`), safe to put inside an element or an attribute. Markup escapes text by
itself, so this is for HTML built as a string: a piece you then mark with `raw`, or
text written into a file. Any value is taken; its text is what `str` gives.

### Examples

```quillo
print(escape("<b>Tom & Jerry's \"show\"</b>"))
print(escape(42), escape(true), escape("plain"))
```

```output
&lt;b&gt;Tom &amp; Jerry&#39;s &quot;show&quot;&lt;/b&gt;
42 true plain
```

### Edge cases

- An `html` value is escaped like text: `escape(markdown(...))` shows the tags.
- Escaping twice doubles the entities: `&lt;` becomes `&amp;lt;`.
- `null` gives the text `null`, not the empty string.
- A list or a map gives its printed form, escaped.
- Letters outside ASCII, newlines and spaces stay as they are.

```quillo
print(escape(markdown("*a*")))
print(escape(escape("<")))
print(escape(null), escape(""))
print(escape([1, "<"]), escape({ a: "<" }))
print(escape("héllo\n😀"))
```

```output
&lt;p&gt;&lt;em&gt;a&lt;/em&gt;&lt;/p&gt;

&amp;lt;
null 
[1, &quot;&lt;&quot;] { a: &quot;&lt;&quot; }
héllo
😀
```

### Errors

None: every value has a text, so `escape` never fails and never gives an error value.
An error value is shown as `err(...)`, escaped.

```quillo
print(escape(err("<bad>")))
```

```output
err(&quot;&lt;bad&gt;&quot;)
```

### Chaining

```quillo
print(["<a>", "b & c"] | map(escape) | join(", "))
let cell = "<script>" | escape
print(raw(`<td>${cell}</td>`))
```

```output
&lt;a&gt;, b &amp; c
<td>&lt;script&gt;</td>
```

### See also

[raw](/docs/reference/raw/), [url_encode](/docs/reference/url_encode/), [markdown](/docs/reference/markdown/), [str](/docs/reference/str/)
