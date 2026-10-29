# css
css(str) -> str
group: Markup

### What it does

The text as it is. Written as a tag on a template, `` css`...` ``, it tells editors to
highlight the text as CSS, and `quillo check` reads the classes it styles, so a class
a page uses that no sheet styles gets a warning. It is the way to write a component's
`style` and the sheet in `<style>{sheet}</style>`. Braces in the template are plain
text; `${...}` fills in values.

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
  minified, and nothing is escaped.
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
sheet as it is, so `a > b` works. A pipeline rarely needs it: `` css`...` `` is already
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
