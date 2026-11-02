# style_with
style_with(str | fn) -> null
group: Browser

### What it does

At the top level of a program, names a command that every component's and view's
`style` goes through as the program loads, before the styles are scoped: the command
reads CSS on its standard input and writes CSS on its standard output. With PostCSS and
Tailwind's plugin (`style_with("npx postcss")`, the config beside the program),
`@apply`, `theme()` and nesting work in a component's own CSS. It may be given a
function instead, written in Quillo or in Rust (a `.rs` or `.qwer` file): a CSS engine
of the program's own, with no Node. The function is called once with all the styles as
one text, each marked with a `/*! quillo-style <id> */` comment, and gives them back as
text, the marks kept. It gives `null`.

### Examples

```quillo noexec
style_with("npx postcss")            // postcss.config.js beside the program loads Tailwind

component Card(title: str) {
    style css`
      .card { @apply rounded border p-4 }
      .title { @apply text-lg font-bold; color: theme(colors.blue.700) }
    `
    <div.card><h2.title>{title}</h2></div>
}

route GET / = <html><body><Card title="Hello"/></body></html>
```

```quillo noexec
use "tailwind.rs"                     // pub fn tailwind_apply(css: String) -> Result<String, String>
style_with(tailwind_apply)
```

```quillo
fn engine(css) = replace(css, "@apply m-2;", "margin: .5rem;")
print(style_with(engine))
```

```output
null
```

### Edge cases

- All the styles go through the command at once, as one sheet, and what it made is
  kept while the CSS is the same: a reload under `--watch` runs it again only when a
  `style` changed.
- The command runs before scoping, so a rule it writes is still made to need the
  component's attribute: with `style_with("sed s/red/blue/")` and a component's `` style css`.x {
  color: red }` ``, the page's sheet holds `.x[data-q-eb88e73d] { color: blue }`.
- A command that fails stops the program loading, with what it said: `` style_with
  `false` failed: ``. So does a function that fails or gives something other than text.
- The marks are how each style is found again: a function that drops one loses that
  component's style.
- Written inside a component it is refused when the program loads (`` `style_with` is
  not available in the browser; call it from a `server fn` ``); it belongs at the top
  level, before or after the components.
- A program with no styles runs the command for nothing: `style_with("cat")` in a
  plain program gives `null` and changes nothing.
- `quillo check` refuses an argument that is neither text nor a function.

```quillo
print(style_with("cat"))
```

```output
null
```

### Errors

An empty command is a runtime error, not an error value, as the program loads. A
function that gives no CSS stops the program before it serves.

```quillo error
print(style_with(""))
```

```output
line 1: `style_with` takes the command to run, like style_with("npx postcss")
```

```quillo error
fn engine(css) = 3
style_with(engine)
component C() {
    style css`.c { color: red }`
    <p.c/>
}
```

```output
main.qwe: style_with `engine` failed: it gave int, not CSS text
```

### Chaining

`style_with` is a declaration, written once at the top level, not piped into or out
of. The command string can be built, from `env` for instance:

```quillo noexec
style_with(env("POSTCSS") ?? "npx postcss")
```

### See also

[classes](/docs/reference/classes/), [raw](/docs/reference/raw/), [escape](/docs/reference/escape/), [file](/docs/reference/file/)
