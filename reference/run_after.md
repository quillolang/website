# run_after
run_after(num, fn) -> null
group: Browser

### What it does

In the browser, calls `f` once, `ms` milliseconds on, and gives `null` at once. If the
component that started it leaves the page first, `f` is not called: the timer goes with
its component, its row or its branch. It may be called from an event handler, from
`@mount`, or from the component's code. On the server it does nothing.

### Examples

```quillo noexec
component Saved() {
    state shown = false
    <div>
        <button @click={() => {
            shown = true
            run_after(3000, () => { shown = false })    // hides it again in 3 s
        }}>Save</button>
        {shown && <span>Saved</span>}
    </div>
}
```

```quillo noexec
component Toast(text, on_close) {
    <p class="toast" @mount={(_el) => { run_after(4000, on_close) }}>{text}</p>
}
```

### Edge cases

- Once only: for again and again, [every](/docs/reference/every/).
- A toast removed by hand before its time is not closed a second time: its timer went
  with it.
- `0` or less is as soon as the browser can, after what the handler is doing now.
- A function that waits (a `server fn`, `js(...)` giving a Promise) may be given: its
  error goes to the console, as an event handler's does.
- From a handler, the timer belongs to the handler's component only if it is started
  before the handler's first wait: after a `server fn` call it belongs to no one, and
  runs even if the component has gone.
- There is no `setTimeout`: `js("setTimeout", ...)` is refused, as it would take text to
  run as code too.

### Errors

A milliseconds that is not a number, or something not a function, is an error in the
browser's console, and `quillo check` says so first.

```quillo noexec
run_after("soon", () => {})    // `quillo check`: argument 1 of `run_after` must be num, got str
```

### Chaining

`run_after` is a statement: its function is where the work goes.

### See also

[every](/docs/reference/every/), [page_updated](/docs/reference/page_updated/), [sleep](/docs/reference/sleep/)
