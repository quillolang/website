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
  check` does not see these: the program's load does.
- A name the page lacks (a library's `<script>` left out) gives the error value `js:
  L.map is not defined on this page`; a value that is `undefined` reads as `null`.
- A function that gives a Promise (`fetch`, `navigator.mediaDevices.getUserMedia`) is
  waited for in an event handler, in `@mount` and in a `state` initializer; elsewhere
  it stays a promise, with `.then(...)`.
- What comes back from the page keeps its properties and methods: `el.value`,
  `chart.update()`, and its fields can be set (`el.scrollTop += 100`). `innerHTML`,
  `on...` handlers and `javascript:` URLs are not set.
- A component that calls `js` in its own code (not only in handlers) loads its bundle
  as soon as the page is idle, since it runs by itself.
- On the server, rendering a component or in a plain program, `js` gives `null`,
  whatever the name, so a `??` default reads naturally there.
- `quillo check` wants the name: `js()` is `` missing argument `arg1` in call to `js` ``.

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
