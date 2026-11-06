# js
js(str, any...) -> any
group: Browser

### What it does

Calls a function of the page's own scripts, found from the page's globals by its
dotted name (`js("L.map", el)`, `js("navigator.clipboard.writeText", text)`), and gives
its result. With no arguments and a name that is not a function, it reads the value
(`js("window.innerWidth")`). It runs in the browser, from a component; while the
server renders the component it gives `null`. A name the page does not have is an
error value, not a runtime error.

A library named on a `client` line is called the same way, as JavaScript reads it:
`client /assets/leaflet.js use L`, then `L.map(el)` is `js("L.map", el)` and
`L.version` reads a value, and the page loads the script itself (see
[JavaScript libraries](/docs/components/#javascript-libraries)).

### Examples

```quillo noexec
component Theme() {
    state dark = js("localStorage.getItem", "theme") == "dark"
    <button @click={() => {
        dark = !dark
        js("localStorage.setItem", "theme", dark ? "dark" : "light")
        js("document.body.classList.toggle", "dark", dark)
    }}>{dark ? "Light" : "Dark"}</button>
}

component Share(link: str) {
    state copied = false
    <button @click={() => {
        let r = js("navigator.clipboard.writeText", link)
        copied = !is_err(r)
    }}>{copied ? "Copied" : "Copy link"}</button>
}
```

### Edge cases

- The name is written in the code, as a string. A variable (`js(name)`) is refused
  when the program loads: `` `js` needs the name of what it calls written out, like
  js("Chart", ...) ``. So are `eval`, `Function`, `setTimeout`, `setInterval`,
  `insertAdjacentHTML`, `document.write` and the like (`` `js` does not call eval: it
  runs text as code ``), and ways around the checks such as `Object.assign` or
  `Reflect.apply`. A name with spaces or empty parts is not a dotted name. `quillo
  check` refuses a name in a variable and one that is not dotted; the names refused by
  what they are (`eval` and the rest), the program's load refuses.
- A name the page lacks (a library's `<script>` left out) gives the error value `js:
  L.map is not defined on this page`; a value that is `undefined` reads as `null`.
- A class called without `new` (`js("Chart", el)`) stops with `Chart is a class: make
  one with Chart.new(...) (or js_new("Chart", ...))`.
- One rule for what waits: a call of the page's that gives a Promise is waited for in an
  event handler, in `@mount`, in a `state` initializer and in a component's `let`
  functions that its markup does not call (`let locate = () => {...}` used as
  `@click={locate}`). That is `js(...)` (`fetch`, `navigator.mediaDevices.getUserMedia`),
  a method of what the page gave (`img.decode()`, `audio.play()`), and a function given as
  a prop. A call followed by `.then`, `.catch` or `.finally` keeps its promise, and so
  does `js_new("Promise", ...)`, which is kept to be used later. Elsewhere, and in a
  top-level `fn`, a promise stays a promise.
- A function of the program's that the page calls with `undefined`, as `.then` does for a
  Promise of nothing (`audio.play()`, `clipboard.writeText`), is given `null`.
- A `state` initializer that reads the page (`state dark = js("localStorage.getItem",
  "theme") == "dark"`) gives `null` from `js` while the server renders the component,
  and runs again in the browser once the component is on the page, which sets the state.
- The page's JavaScript gets plain numbers: a whole float such as `2.0`, a float in
  Quillo's code, reaches it as the number `2`, inside lists and maps too, given to
  `js(...)`, to a function the page gave, or set on the page's object.
- A map reaches the page's code as a plain object. A Quillo map keeps the order its
  keys were set, where a JavaScript object lists keys that are array indexes (`"0"`,
  `"7"`) first: a map holding such a key out of that order reaches the page as a plain
  copy in JavaScript's order, so `URLSearchParams`, `Headers` and deep-equality libraries
  take it, and what the page changes in that copy does not show in Quillo. A map
  without such keys is the map itself, as before, and a change the page makes to it
  shows. What a function of the program's gives back to page code that called it is
  given the same way.
- What comes back from the page keeps its properties and methods: `el.value`,
  `chart.update()`, and its fields can be set (`el.scrollTop += 100`). `innerHTML`,
  `on...` handlers and `javascript:` URLs are not set.
- A component that calls `js` in its own code (not only in handlers) loads its bundle
  as soon as the page is idle, since it runs by itself.
- On the server, rendering a component or in a plain program, `js` gives `null`,
  whatever the name, so a `??` default reads naturally there.
- `quillo check` wants the name: `js()` is `` missing argument `name` in call to `js`: js(name, args) ``.

```quillo
print(js("window.innerWidth"), js("Chart.register", 1))
print(js("localStorage.getItem", "theme") ?? "light")
```

```output
null null
light
```

### Errors

A first argument that is not a string is a runtime error on the server. In the browser,
giving arguments to a name that is not a function (`js("document.title", "x")`) is a
runtime error too (`` `js`: document.title is not a function ``), written to the
console; a missing name is an error value, as above.

```quillo error
print(js(42))
```

```output
line 1: `js` takes the name of what it calls first: js("Chart", ...)
```

### Chaining

`js` takes the name first, so it is rarely the target of a pipeline; its result is:

```quillo noexec
let width = js("window.innerWidth") ?? 0
let rows = js("JSON.parse", text) | filter((r) => r.ok)
```

### See also

[js_new](/docs/reference/js_new/), [ask](/docs/reference/ask/), [notify](/docs/reference/notify/), [http.get](/docs/reference/http.get/)
