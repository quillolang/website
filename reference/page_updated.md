# page_updated
page_updated() -> null
group: Browser

### What it does

In the browser, in an event handler, waits until the page shows what the handler has set
so far, and gives `null`. A state set in a handler is shown when the handler lets go;
`page_updated()` lets the handler read the page after it, as `focus()` on a field that a
state just made appear needs. On the server it does nothing.

### Examples

```quillo noexec
component Search() {
    state open = false
    state field = null
    <div>
        <button @click={() => {
            open = true
            page_updated()               // the input is on the page now
            field.focus()
        }}>Search</button>
        {open && <input @mount={(el) => { field = el }}/>}
    </div>
}
```

### Edge cases

- Only what was set before it is shown; what the handler sets after it is shown when
  the handler ends, as usual.
- It waits a moment, not a frame: the page is updated, not yet painted. For a frame,
  `js("requestAnimationFrame", f)`.
- Outside a handler (in a component's code, at the top of a program) there is nothing to
  wait for, and it gives `null` at once.

### Errors

It takes nothing; `page_updated(1)` is an error from `quillo check`.

### Chaining

None: it is a statement in a handler.

### See also

[run_after](/docs/reference/run_after/), [every](/docs/reference/every/), [js](/docs/reference/js/)
