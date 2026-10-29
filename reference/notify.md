# notify
notify(str, map | null=) -> null
group: Browser

### What it does

Shows a note on the page (a toast) that goes away by itself after 4 seconds, or after
`seconds` from the options; `title` adds a heading and `tone` a class (`q-success`,
`q-danger`). It does not wait and gives `null`. It is called from an event handler or
`@mount` of a component; on the server there is no page, so there it is a runtime
error.

### Examples

```quillo noexec
server fn save_draft(text: str) -> bool ! str {
    if trim(text) == "" { return err("nothing to save") }
    db.exec("insert into drafts (text) values (?)", text)
    true
}

component Editor() {
    state draft = ""
    <form @submit={() => {
        let r = save_draft(draft)
        if is_err(r) {
            notify(r.error, { title: "Not saved", tone: "danger", seconds: 8 })
        } else {
            notify("Draft saved", { tone: "success" })
        }
    }}>
        <textarea bind:value={draft}></textarea>
        <button>Save</button>
    </form>
}
```

### Edge cases

- Several notes stack in one list (`q-toasts`), newest last; each has its own close
  button and its own clock.
- `seconds` is read as a number: `{ seconds: 0.5 }` is half a second.
- The message and the title are shown as text, not as HTML.
- The note is markup in a host the page lays out (`<body data-notices="dialog-center
  toasts-top-right">`), with the classes `q-toasts`, `q-toast`, `q-title`,
  `q-message` and `q-close`, `q-open` while it shows and `q-` plus the tone. The
  program's own sheet styles them.
- Where it may be called: an event handler, `@mount`, or a function they call, and a
  tick of `every` (the guide's `if total > 1000 { every(5000, () => { notify("Big
  order!") }) }`). Written in the component's own code or a `let`, it runs while the
  server renders the component, where it fails (a 500).
- `quillo check` counts the arguments: `notify("x", { seconds: 2 }, 3)` is `` `notify`
  takes 2 arguments, got 3 ``.

### Errors

On the server `notify` is a runtime error, not an error value: it stops the request.
A route that wants to tell the visitor something renders it in the page instead.

```quillo error
print(notify("Saved"))
```

```output
line 1: `ask` and `notify` speak to someone in the browser: call them from a component (an event handler)
```

### Chaining

`notify` gives `null`, so nothing is piped out of it; it is the last thing a handler
does with a result:

```quillo noexec
@click={() => { let n = len(sync()); notify(`${n} items synced`) }}
```

### See also

[ask](/docs/reference/ask/), [every](/docs/reference/every/), [js](/docs/reference/js/)
