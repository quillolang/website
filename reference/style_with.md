# style_with
style_with(str) -> null
group: Browser

### What it does

At the top level of a program, names a command that every component's and view's
`style` goes through as the program loads, before the styles are scoped: the command
reads CSS on its standard input and writes CSS on its standard output. With PostCSS and
Tailwind's plugin (`style_with("npx postcss")`, the config beside the program),
`@apply`, `theme()` and nesting work in a component's own CSS. It gives `null`.

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

### Edge cases

- All the styles go through the command at once, as one sheet, and what it made is
  kept while the CSS is the same: a reload under `--watch` runs it again only when a
  `style` changed.
- The command runs before scoping, so a rule it writes is still made to need the
  component's attribute: with `style_with("sed s/red/blue/")` and a component's `` style css`.x {
  color: red }` ``, the page's sheet holds `.x[data-q-eb88e73d] { color: blue }`.
- A command that fails stops the program loading, with what it said: `` style_with
  `false` failed: ``.
- Written inside a component it is refused when the program loads (`` `style_with` is
  not available in the browser; call it from a `server fn` ``); it belongs at the top
  level, before or after the components.
- A program with no styles runs the command for nothing: `style_with("cat")` in a
  plain program gives `null` and changes nothing.
- `quillo check` refuses a command that is not a string: `style_with(1)` is `` argument
  1 of `style_with` must be str, got int ``.

```quillo
print(style_with("cat"))
```

```output
null
```

### Errors

An empty command is a runtime error, not an error value, as the program loads.

```quillo error
print(style_with(""))
```

```output
line 1: `style_with` takes the command to run, like style_with("npx postcss")
```

### Chaining

`style_with` is a declaration, written once at the top level, not piped into or out
of. The command string can be built, from `env` for instance:

```quillo noexec
style_with(env("POSTCSS") ?? "npx postcss")
```

### See also

[raw](/docs/reference/raw/), [escape](/docs/reference/escape/), [file](/docs/reference/file/)
