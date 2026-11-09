# ask
ask(str, map | null=) -> bool
group: Browser

### What it does

Asks the visitor a question in a dialog on the page and waits for the answer: a
component's handler gets `true` when OK is pressed, `false` for Cancel, Escape or a click
on the backdrop.

The dialog's options are `title`, `ok` and `cancel` (the buttons' words, "OK" and
"Cancel" otherwise) and `tone` (`"danger"` starts with the focus on Cancel). It is called
from an event handler or `@mount` of a component, which waits for the answer and goes
on. On the server there is no one to ask, so there the dialog is a runtime error. A tool
(`fn mcp`) asks the person at the AI client with [about](/docs/reference/about/) (a
choice) or [confirm](/docs/reference/confirm/) (a yes or a no) instead.

### Examples

```quillo noexec
server fn remove_note(id: int) = db.exec("delete from notes where id = ?", id)

component Note(id: int, text: str) {
    state gone = false
    <li>
        {gone ? "(removed)" : text}
        <button @click={() => {
            if ask(`Remove "${text}"?`, { title: "Remove", ok: "Remove", tone: "danger" }) {
                remove_note(id)
                gone = true
            }
        }}>Remove</button>
    </li>
}
```

### Edge cases

- The handler stops at `ask` until the dialog is answered; the rest of the page keeps
  working, and state assigned before the call shows while the dialog is open.
- Without options the buttons say "OK" and "Cancel", and the focus starts on OK. The
  message and the title are shown as text, not as HTML.
- Escape, the backdrop and Cancel all answer `false`. Tab moves between the two
  buttons, and the focus goes back to the element that had it when the dialog closes.
- The dialog is markup in a host the page lays out (`<body data-notices="dialog-center
  toasts-top-right">`), with the classes `q-backdrop`, `q-dialog`, `q-title`,
  `q-message`, `q-actions`, `q-cancel` and `q-ok`, `q-open` while it shows and
  `q-danger` for the tone. The program's own sheet styles them; nothing is styled
  for you.
- Where it may be called: an event handler or `@mount`, where code can wait. In a
  `let` of the component it is refused when the program loads (`` `ask` waits on the
  server, so a component can only call it from an event handler (@click={() => { ... }})
  or to set state: state x = ask(...) ``). As a `state` initializer it passes the load
  but fails while the server renders the component (a 500), since initializers run on
  the server.
- `quillo check` refuses options that are not a map: `ask("x", 42)` is `` argument 2 of
  `ask` must be map | null, got int ``.
- With three arguments, the old form of a tool's question, it is an error that names
  [about](/docs/reference/about/) (`` `ask(message, options)` is the page's dialog; a
  question with choices for the person at an AI client is `about(question, choices,
  default)` ``), from `quillo check` and as it runs; in a tool's code, `ask` is an error
  that names `about` and `confirm`.

### Errors

On the server, in a route, a plain program or a `server fn`, the dialog (one or two
arguments) is a runtime error, not an error value: it stops the request with a message
that says where to call it.

```quillo error
print(ask("Delete everything?"))
```

```output
line 1: `ask` and `notify` speak to someone in the browser: call them from a component (an event handler)
```

### Chaining

`ask` is not a pipeline function; it reads as a condition in a handler:

```quillo noexec
@click={() => { if ask("Sure?") { remove(id) } }}
@click={() => { ask("Sign out?", { ok: "Sign out" }) && sign_out() }}
```

### See also

[notify](/docs/reference/notify/), [navigate](/docs/reference/navigate/), [js](/docs/reference/js/), [about](/docs/reference/about/), [confirm](/docs/reference/confirm/)
