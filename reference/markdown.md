# markdown
markdown(str, map | null=) -> html
group: Markup

### What it does

Markdown text as HTML: CommonMark with tables, strikethrough and task lists. HTML
written in the text is shown as text and a `javascript:` link points at
`about:blank#blocked`, so it is safe for what visitors write. The result is an `html`
value, which markup shows as it is (no escaping); `str(...)` gives its text, to store.
The options are `{ html: true }`, which keeps the HTML in the text, for text you wrote,
and `{ inline: true }`, which keeps only what fits inside a line (bold, italic, code,
links) for a headline or a caption: no paragraph around it, no headings or lists.

### Examples

```quillo
print(markdown("# Title\n\nSome *emphasis* and **bold**."))
print(markdown("<b>hi</b> there"))
print(markdown("<b>hi</b> there", { html: true }))
print(markdown("A **headline**", { inline: true }))
print(str(markdown("*hi*")))
```

```output
<h1>Title</h1>
<p>Some <em>emphasis</em> and <strong>bold</strong>.</p>

<p>&lt;b&gt;hi&lt;/b&gt; there</p>

<p><b>hi</b> there</p>

A <strong>headline</strong>
<p><em>hi</em></p>

```

### Edge cases

- The empty string gives an empty `html` value.
- A `javascript:` or `vbscript:` link or image becomes `about:blank#blocked`; other
  schemes pass as written.
- A fenced code block that names a language comes out highlighted, as
  [highlight](/docs/reference/highlight/) does it, in `<pre class="hl">`.
- With `inline`, lines and paragraphs are joined by `<br>`, and a list's items keep
  their marks as text (`• `, `1. `); a heading is its text.
- An `html` value is not equal to a string with the same text; compare `str(...)`.

```quillo
print(len(str(markdown(""))))
print(markdown("[click](javascript:alert(1))"))
print(markdown("```js\nlet x = 1\n```"))
print(markdown("# Big\n\n- one\n- two", { inline: true }))
print(markdown("para one\n\npara two", { inline: true }))
let h = markdown("*a*")
print(h == "<p><em>a</em></p>\n", str(h) == "<p><em>a</em></p>\n")
```

```output
0
<p><a href="about:blank#blocked">click</a></p>

<pre class="hl"><code class="language-js"><span class="hl-k">let</span> x = <span class="hl-n">1</span>
</code></pre>

Big<br>• one<br>• two
para one<br>para two
false true
```

### Errors

Text that is not a string (null too) is a runtime error, not an error value, and so
are options that are not a map. `null` is fine as the options.

```quillo error
print(markdown(null))
```

```output
line 1: `markdown` expects a str as argument 1, got null
```

```quillo error
print(markdown("hi", "inline"))
```

```output
line 1: `markdown` expects options as a map, got str
```

### Chaining

In a pipeline the text comes first, so the options are the only argument written. In
a component the server makes it (a request to `/_quillo/markdown`), awaited like a
`server fn`: call it in an event handler and keep the text in state.

```quillo
print("the *caption*" | markdown({ inline: true }))
print("**b**" | markdown | str | trim)
```

```output
the <em>caption</em>
<p><strong>b</strong></p>
```

```quillo noexec
component Editor() {
    state text = ""
    state preview = ""
    <textarea @input={(e) => { text = e.value; preview = str(markdown(e.value)) }}>{text}</textarea>
    <div>{raw(preview)}</div>
}
```

### See also

[highlight](/docs/reference/highlight/), [raw](/docs/reference/raw/), [escape](/docs/reference/escape/), [str](/docs/reference/str/)
