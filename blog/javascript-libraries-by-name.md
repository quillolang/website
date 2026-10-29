---
title: JavaScript libraries by name: use Chart from ...
date: 2026-10-30
summary: A component now names the JavaScript library it uses with use, calls it as JavaScript reads (Chart.new, L.map, confetti()), and the page loads the script only where that component is.
tags: components, javascript
---
Quillo has no npm and no `import`: a chart, a map or an editor is a script the page loads, and a component hands it an element in `@mount`. Until now that took two steps that did not know about each other: a `<script>` tag in the page's head, and `js_new("Chart", el, config)` in the component, the library's name written as a string. Nothing checked that the two matched, and nothing told you whether a library wanted `js` or `js_new`.

Now the component's file says which library it uses, and the code reads as the library's own documentation does:

```quillo
use Chart from "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
use confetti from "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"

component Sales(points: list) {
    state chart = null
    <canvas @mount={(el) => {
        chart = Chart.new(el, { type: "line", data: points })
        () => chart.destroy()
    }}></canvas>
    <button @click={() => confetti({ particleCount: 120 })}>Celebrate</button>
}
```

### Which name

The name after `use` is what the script defines on the page: `Chart` for Chart.js, `L` for Leaflet, `confetti`, `dayjs`. It is the name the library's README uses in its plain-`<script>` example, in its case. One script can give several (`use L, LeafletDraw from /assets/leaflet.js`), and `as` gives one a name of your own.

### Classes and functions

`Name.new(...)` is `new Name(...)`; `Name(...)` and `Name.fn(...)` are calls; `Name.field` reads a value, so `Chart.version` is `"4.4.1"`. When you get it wrong, the error says what to write instead: `Chart(el)` stops with "Chart is a class: make one with Chart.new(...)", and `chart.new(el)` gives the error value "chart is not defined on this page (did you mean Chart?)".

### Loaded where it is used

The script is not a tag in every page's head. A page loads it only when a component that uses the library is on it (or one it can come to show), once, before the components' own code; a page without one loads nothing more. On the server, while the component renders, the names give `null`, as `js(...)` always has, so library calls belong in `@mount` and event handlers.

### What stays

`js("path.fn", ...)` and `js_new(...)` stay, for what the page's own scripts define. The calls go through the same guard-rails: no `eval`, no `Function`, no `setTimeout` with text, no markup set from data. The [JavaScript libraries](/docs/components/#javascript-libraries) section of the guide has the details.
