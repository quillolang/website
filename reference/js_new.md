# js_new
js_new(str, any...) -> any
group: Browser

### What it does

Makes an object of a class the page's scripts define, by its dotted name, with the
arguments given to its constructor: `js_new("Chart", el, config)` is `new Chart(el,
config)`. The object's methods and properties are then fields: `chart.update()`,
`chart.destroy()`. It runs in the browser, from a component; while the server renders
the component it gives `null`. A name the page does not have is an error value.

A library named with `use` is called the same way, as JavaScript reads it:
`use Chart from https://.../chart.umd.min.js`, then `Chart.new(el, config)` is
`js_new("Chart", el, config)`, and the page loads the script itself (see
[JavaScript libraries](/docs/components/#javascript-libraries)).

### Examples

```quillo noexec
component Sales(points: list) {
    state chart = null
    <canvas @mount={(el) => {
        chart = js_new("Chart", el, { type: "line", data: points })
        () => chart.destroy()                   // when the canvas leaves the page
    }}></canvas>
}

route GET / = <html><head><script src="/assets/chart.js"></script></head>
                    <body><Sales points={load_points()}/></body></html>
```

### Edge cases

- The name is written in the code, as a string: a variable is refused when the program
  loads (`` `js_new` needs the name of what it calls written out, like js_new("Chart",
  ...) ``), as are `Function` and the other names `js` refuses.
- A name the page lacks gives the error value `js_new: Chart is not defined on this
  page`, so the component can show that the library is missing instead of stopping. A
  name in another case says the one the page has: `(did you mean Chart?)`.
- A name that is on the page but is not a class or function (`js_new("document")`) is a
  runtime error in the browser: `` `js_new`: document is not a class ``.
- The object is kept in state or a local as it is; its fields can be read and set, and
  a Quillo function given to its methods (`marker.on("click", () => ...)`) is called with
  as many arguments as it declares.
- Calling it in the component's own code (not only in `@mount`) makes the component
  load its bundle as soon as the page is idle.
- On the server it gives `null`, whatever the name.
- `quillo check` refuses a first argument that is not a string: `js_new(42)` is
  `` argument 1 of `js_new` must be str, got int ``.

```quillo
print(js_new("Chart", 1, 2))
print(js_new("Map") ?? "no page")
```

```output
null
no page
```

### Errors

A first argument that is not a string is a runtime error on the server, with the same
message as `js`.

```quillo error
print(js_new(42))
```

```output
line 1: `js` takes the name of what it calls first: js("Chart", ...)
```

### Chaining

The object is what gets chained, through its methods:

```quillo noexec
let map = js_new("L.Map", el, { center: [51.5, -0.1], zoom: 12 })
map.on("moveend", () => { center = map.getCenter() })
```

### See also

[js](/docs/reference/js/), [ask](/docs/reference/ask/), [notify](/docs/reference/notify/)
