# css
css(str) -> str
group: Markup

### What it does

The text as it is. Written as a tag on a template, `` css`...` ``, it tells editors to
highlight the text as CSS, and `quillo check` reads the classes it styles, so a class
a page uses that no sheet styles gets a warning. It is the way to write a component's
`style` and the sheet in `<style>{sheet}</style>`. Braces in the template are plain
text; `${...}` fills in values, each with its `{`, `}`, `;`, `\` and `&` written as
CSS's escapes (`\7b `, `\7d `, `\3b `, `\5c `, `\26 `), so a value is one value and adds
no declaration or rule of its own *(since 0.7)*.

### Examples

```quillo
let sheet = css`
  .card { padding: 1rem }
  .card:hover { background: #eee }
`
print(sheet)
let accent = "darkred"
print(css`.title { color: ${accent} }`)
```

```output

  .card { padding: 1rem }
  .card:hover { background: #eee }

.title { color: darkred }
```

### Edge cases

- The result is a plain string, equal to the text written: nothing is parsed or
  minified. Only the values of `${...}` are escaped, and only those five characters, so
  `a > b` and `url(...)` in a value stay as they are. The `&` is among them because
  inside `<svg>` and `<math>` a browser reads a `<style>`'s `&#125` as a `}`.
- A value from a visitor cannot end its rule: `?color=red} input[value^=a]{...}` added a
  rule that read the page's fields. A value that is meant to hold declarations of its
  own, `"color: red; margin: 0"`, is one value too: join such text with `+`, outside the
  template.
- Called as a function, `css("...")`, it gives the same string; only the tag form is
  highlighted and read by `quillo check`.
- An empty template gives the empty string.

```quillo
print(css`.a { color: red }` == ".a { color: red }")
print(css(".b { margin: 0 }"))
print(len(css``))
```

```output
true
.b { margin: 0 }
0
```

```quillo
let q = "red} input{background:url(//evil/a)"
print(css`.title { color: ${q} }`)
print(css`.title { color: ${"red&#125 rect{fill:red"} }`)
```

```output
.title { color: red\7d  input\7b background:url(//evil/a) }
.title { color: red\26 #125 rect\7b fill:red }
```

### Errors

A value that is not a string is a runtime error, not an error value.

```quillo error
print(css(42))
```

```output
line 1: `css` expects a str as argument 1, got int
```

### Chaining

A component's `style` comes first in its body, before its markup; `<style>` takes the
sheet as it is, so `a > b` works, but for each `<`, written as CSS's `\3c ` (the same
character to CSS), so the text cannot end the element, nor start one inside `<svg>` or
`<math>` *(since 0.7)*. A pipeline rarely needs it: `` css`...` `` is already
the string.

```quillo noexec
component Card() {
    style css`
      .title { color: darkred }
      .title:hover { text-decoration: underline }
    `
    <div.card><h2.title>Hello</h2></div>
}

let sheet = css`body { margin: 0 }`
route GET / = <html><head><style>{sheet}</style></head><body>hi</body></html>
```

### See also

[sql](/docs/reference/sql/), [raw](/docs/reference/raw/), [str](/docs/reference/str/)
