# ask
ask(str, map | null=, str | null=) -> bool | str | null
group: Browser

### What it does

Asks a question and waits for the answer, in one of two places. With one or two
arguments it is a page's dialog: a component's handler asks the visitor, and gets `true`
when OK is pressed, `false` for Cancel, Escape or a click on the backdrop. With three,
`ask(question, choices, default)`, it is a tool's question: in a tool (`fn mcp`) the person
at the AI client picks one of `choices`, a map from a key to the text they see, and `ask`
gives the key they picked.

The dialog's options are `title`, `ok` and `cancel` (the buttons' words, "OK" and
"Cancel" otherwise) and `tone` (`"danger"` starts with the focus on Cancel). It is called
from an event handler or `@mount` of a component, which waits for the answer and goes
on. On the server there is no one to ask, so there the dialog is a runtime error.

A tool's question stops the call as [confirm](/docs/reference/confirm/) does: the client
is sent a form with the choices, asks the person, and calls the tool again with the
answer, and the function runs again from the top, this time getting the key. A client
that cannot ask gets `default`, and the tool's result says so, so the model can tell the
person. Outside a tool's call (the program's own code, or a page calling a `server fn
mcp`) it gives `default` at once. See [Tools for AI
clients](/docs/mcp/#asking-the-person-first).

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

A tool's question, before the change it decides:

```quillo noexec
/// Publishes a post. It is public at once.
fn mcp publish_post(title: str, body: str) -> int with db {
    let who = ask("Who can see it?", { public: "Everyone", draft: "Only me, as a draft" }, "draft")
    if !confirm(`Publish "${title}" now?`) { return err("not published: the user said no") }
    db.one("insert into posts (title, body, draft) values (?, ?, ?) returning id", title, body, who == "draft").id
}
```

The client shows `Who can see it?` with the two texts, `Only me, as a draft` chosen to
start; then the box `Publish "..." now?`. With a client that cannot show a form, `ask`
takes the default, and a tool that goes on to its answer adds the line `the user was not
asked "Who can see it?": the default "Only me, as a draft" was taken` to its result; this
one stops at `confirm` instead, which needs a yes (`this needs the user's yes, and this
client cannot ask`). Outside a tool's call the default is the answer:

```quillo
print(ask("Who can see it?", { public: "Everyone", draft: "Only me, as a draft" }, "draft"))
print(ask("Which colour?", { red: "Red", blue: "Blue" }, null))
```

```output
draft
null
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
- The tool's question needs all three arguments. `default` is one of the choices' keys, or
  `null` for none (then nothing is picked to start, and a client that cannot ask gets
  `null`). `quillo check` refuses a default that is not a key (`` `ask`'s default "c" is not
  one of its choices: `a`, `b` ``) and choices that are empty, and the call stops on them
  as it runs.
- In a tool's code, `ask` with fewer than three arguments is a `quillo check` error (`` in
  a tool, `ask` takes the choices' default as its third argument: ask(question, choices,
  default) ``), and stops the call as it runs. A component cannot use the three-argument
  form.
- A person who declines or dismisses a tool's question ends the call, with an `isError`
  saying so (`the user declined to answer: Who can see it?`).
- A tool's question never asks for free text, only for a choice, as MCP forbids asking
  for passwords, keys or payment details in a form. A tool asks before it changes anything,
  as with `confirm`; the same rules hold (the signed state, at most 100 questions, a
  question after a change refused).

### Errors

On the server, in a route, a plain program or a `server fn`, the dialog (one or two
arguments) is a runtime error, not an error value: it stops the request with a message
that says where to call it. The tool's form gives its default there.

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

[confirm](/docs/reference/confirm/), [notify](/docs/reference/notify/), [navigate](/docs/reference/navigate/), [js](/docs/reference/js/), [Tools for AI clients](/docs/mcp/)
