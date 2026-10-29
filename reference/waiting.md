# waiting
waiting(any) -> bool
group: Browser

### What it does

Whether a component's live state is waiting for an answer: `true` from the moment the
arguments of its `live(load, ...)` change until the new value arrives (and while a page
the browser made waits for its first), `false` otherwise. The state keeps its old value
meanwhile, so a grid that moved to December can say it still shows November. It takes
the state by its name, and what reads it follows it. On the server it is `false`,
since the server renders with the answer.

### Examples

```quillo noexec
server fn load_month(month: str) = db.query("select * from sales where month = ?", month)

component Grid(month: str) {
    state rows = live(load_month, month)
    <table class={waiting(rows) ? "stale" : ""}>
        <caption>{month}{waiting(rows) ? " (loading)" : ""}</caption>
        {for r in rows => <tr key={r.id}><td>{r.day}</td><td>{r.total}</td></tr>}
    </table>
}
```

### Edge cases

- The argument is a `state` of the component, written by its name. Anything else, a
  `let`, a prop or an expression, is refused when the program loads: `` `waiting`
  takes a component's live state by its name (`state m = live(...)`) ``. `quillo check`
  does not see this; the program's load does.
- A state that is not live (`state n = 0`) compiles, and is never waiting.
- It is `true` only for a load the arguments started, or the first load of a page made
  in the browser: a loader run again because a table changed keeps showing the old
  rows until the new ones come, without `waiting` turning true.
- When the loader answers with an error value, the state becomes that error value and
  `waiting` is `false`.
- On the server, and in a plain program, it is `false` for anything.

```quillo
let rows = [1, 2]
print(waiting(rows), waiting(null))
```

```output
false false
```

### Errors

`waiting` never fails at run time: on the server it is `false` whatever it is given,
and in the browser a wrong argument is refused before the page runs, as above.

```quillo
print(waiting(42))
```

```output
false
```

### Chaining

It reads as a condition in the markup, together with the state it asks about:

```quillo noexec
<table class={waiting(rows) ? "stale" : ""}>
<button disabled={waiting(rows)}>Reload</button>
```

### See also

[live](/docs/reference/live/), [watch](/docs/reference/watch/), [publish](/docs/reference/publish/)
