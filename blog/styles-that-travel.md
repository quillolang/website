---
title: Styles that travel with components
date: 2026-10-28
summary: A page should carry the CSS of what it shows, not of every component the program has. style global did that for the booking app's home page, from 115,598 bytes to 30,663.
tags: css, performance, components
---
A component library brings its styles in one sheet. Include the library and every page carries every component's CSS, used or not. The booking platform built to test Quillo used 37 components from the UI kit, and its home page carried all their styles: 96,553 bytes of `<style>` on a page that showed a handful.

### CSS in the component

```quillo
let card_css = css`
.ui-card { border: 1px solid var(--ui-border); border-radius: var(--ui-radius); }
`

view Card(title: str, children) {
    style global card_css
    <section.ui-card><h2>{title}</h2>{children}</section>
}
```

`style global card_css` in a view or component's body says: this CSS goes with me. A page is sent the styles of the components it shows, and of those it can come to show in the browser, and nothing else. Each text is sent once, however many components share it, and the browser keeps the sheet.

`global` keeps the selectors as written, which a library needs: its classes are its own, prefixed, and a rule may style what you pass in. Without `global`, a component's style is scoped to its own elements.

### What it did

On the booking app's home page, with the kit moved onto it the same day:

| Measured | Before | After |
|---|---|---|
| The page | 115,598 bytes | 30,663 bytes |
| Its `<style>` | 96,553 bytes | 8,692 bytes |

The kit followed: each of its components now carries its own CSS, and `ui_css` is only the theme.

> **Read more:** [Components](/docs/components/) in the docs, and the [UI kit](/components/).
