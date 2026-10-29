# every
every(num, fn, map | null=) -> null
group: Browser

### What it does

In a component's code, calls `f` every `ms` milliseconds in the browser, for as long
as the code that called it stands: `if running { every(100, step) }` runs while
`running` is true, starts over when `speed` or anything else it read changes, and
stops when the condition is false or the component leaves the page. It gives `null`.
At the top of a program it is the server's clock instead: a tick that runs `f` every
`ms` milliseconds, named after its function or by `{ name: "..." }`.

### Examples

```quillo noexec
component Clock() {
    state running = false
    state speed = 1000
    state ticks = 0
    if running { every(speed, () => { ticks += 1 }) }    // stops when running is false,
    <div>                                                 // starts over when speed changes
        <button @click={() => { running = !running }}>{running ? "Stop" : "Start"}</button>
        <button @click={() => { speed = speed / 2 }}>Faster</button>
        <span>{ticks}</span>
    </div>
}
```

```quillo noexec
component Saved() {
    state shown = false
    if shown { every(3000, () => { shown = false }) }     // a one-off delay: the tick turns itself off
    <div>
        <button @click={() => { shown = true }}>Save</button>
        {shown && <span>Saved</span>}
    </div>
}
```

### Edge cases

- It is the only clock: there is no `setTimeout`, so a delay, a debounce or a throttle
  is an `every` under a state flag that the tick turns off, as above.
- It is called from the component's code, a `let` or an `if` there, not from an event
  handler: there it is an error in the browser (`` `every` works in a component ``,
  in the console), which `quillo check` does not see. A handler sets the state that
  the `if` reads.
- What a statement starts, it stops: before the statement runs again, and when its
  component, row or branch leaves the page, the timer is cleared.
- A tick's function may call a `server fn` or `notify`; an error in it is written to
  the console and the next tick still runs. A tab in the background is slowed by the
  browser to once a second at most. Under one millisecond is taken as one.
- While the server renders the component it does nothing and gives `null`; the browser
  starts the timer when it resumes the component, which loads its bundle as soon as
  the page is idle, since it runs by itself.
- At the top of a program it is a server tick: counted from 1970 so each tick falls on
  a multiple of `ms`; a tick still running when the next is due skips it; ticks stop
  with the server and on a reload; a program with one is a server. Two ticks cannot
  share a name, and a name is letters, digits, `_`, `-` and `.`.
- `quillo check` wants a number and a function: `every("fast", f)` is `` argument 1 of
  `every` must be num, got str `` and `every(100)` is `` missing argument `arg2` in call
  to `every` ``.

```quillo error
fn tick() { print("tick") }
every(50, tick)
every(100, tick)
```

```output
line 3: `every`: there is already a tick named "tick"; give this one another with { name: ... }
```

### Errors

On the server a tick needs at least one millisecond and a function: anything else is a
runtime error, not an error value, as the program loads.

```quillo error
fn tick() { print("tick") }
print(every(0, tick))
```

```output
line 2: `every` on the server takes at least 1 millisecond: every(50, step)
```

```quillo error
print(every(50, "tick"))
```

```output
line 1: `every` takes milliseconds and a function: every(100, step)
```

### Chaining

`every` is a statement, not a value: it is not piped into or out of. The function it
is given is where the chaining happens:

```quillo noexec
if polling { every(5000, () => { status = check_status(id) }) }
```

### See also

[listen](/docs/reference/listen/), [live](/docs/reference/live/), [schedule](/docs/reference/schedule/), [sleep](/docs/reference/sleep/), [now](/docs/reference/now/)
