# live
live(fn, any...) -> any
group: Browser

### What it does

Makes a component's state follow the server: `state notes = live(load_notes)` calls the
`server fn` now and gives its result, and the browser calls it again, and updates what
shows the state, whenever something it read changes (a table it queried, a global it
used, a topic it `watch`ed), for anyone, not only this page. The arguments after the
function are followed too: `live(load, id)` loads again when `id` changes. It is
written only as a `state` initializer, with a `server fn` by its name.

### Examples

```quillo noexec
server fn load_notes() = db.query("select id, text from notes order by id")

server fn add_note(text: str) = db.exec("insert into notes (text) values (?)", text)

component Notes() {
    state notes = live(load_notes)                 // every open page sees new notes
    state draft = ""
    <div>
        <ul>{for n in notes => <li key={n.id}>{n.text}</li>}</ul>
        <form @submit={() => { add_note(draft); draft = "" }}>
            <input bind:value={draft}/>
        </form>
    </div>
}
```

```quillo noexec
server fn load_month(month: str) = db.query("select * from sales where month = ?", month)

component Grid(month: str) {
    state rows = live(load_month, month)           // loads again when month changes
    <table class={waiting(rows) ? "stale" : ""}>
        {for r in rows => <tr key={r.id}><td>{r.day}</td><td>{r.total}</td></tr>}
    </table>
}
```

### Edge cases

- The server renders the first value, so the page arrives with the data. The page then
  keeps one WebSocket open (`/_quillo/live`) and runs the loader again when a topic it
  read changes; it gets the latest value, not every change in between, and is sent only
  what changed.
- Until a new answer comes (after the arguments changed), the state keeps the old
  value; `waiting(rows)` is `true` meanwhile. An answer still on its way for old
  arguments is dropped.
- The arguments are sent as JSON, so they must be data: no functions, no HTML.
- A loader that returns an error value makes the state that error value. One that
  fails with a runtime error, or replies a status that is not a success, leaves the
  state as it was (the console says so), and the next change tries again.
- The loader runs as a call from the page, with its cookies, so `session()` inside it
  is the viewer's. What it reads is recorded through the functions it calls too;
  `unwatched(() => me())` reads without following, and `watch("topic")` follows a
  topic that `publish("topic")` announces.
- Only writes made through Quillo (`db.*`, assignments to globals, `publish`) wake
  pages; a row changed by `psql` does not.
- In a route, a view or a plain program it calls the function once and follows
  nothing: live data is a component's.
- `quillo check` refuses every other form: a lambda (`` `live` needs a server fn by
  name: state items = live(load_items, ...) ``), a plain `fn` (`` `live` needs a server
  fn: `load` is not one ``), and a call that is not a `state` initializer, in a `let` or
  a handler (`` in <Notes>, `live(...)` sets state: state items = live(load_items, ...) ``).

A program with a `server fn` is a server, so there is no plain program to run `live`
in: the first example's page is what it looks like.

### Errors

A function that is not a `server fn` is a runtime error, not an error value, on the
server too (with `--no-check`); an argument the function's type does not take fails as
the call would.

```quillo error
fn load_notes() = ["milk", "bread"]
print(live(load_notes))
```

```output
line 2: `live` needs a server fn to call, like live(load_notes), got fn
```

### Chaining

`live` is not piped into: it stands alone on the right of `state x =`. What follows
reads the state:

```quillo noexec
state notes = live(load_notes)
let open = notes | filter((n) => !n.done)
let count = len(open)
```

### See also

[waiting](/docs/reference/waiting/), [watch](/docs/reference/watch/), [publish](/docs/reference/publish/), [unwatched](/docs/reference/unwatched/), [listen](/docs/reference/listen/)
