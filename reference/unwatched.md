# unwatched
unwatched(fn) -> any
group: Jobs and services

### What it does

Calls the function and gives what it gives, without following what it read: the
tables, the global variables and the `watch` calls inside it do not make the running
`live` loader run again. For data a loader needs but should not follow, such as who is
signed in, or a table it reads by one row while watching a topic of its own. See
[Live data](/docs/components/#live-data).

### Examples

```quillo noexec
server fn load_inbox() {
    let me = unwatched(() => me())                        // the sessions table wakes nothing
    db.query("select * from messages where to_id = ?", me.id)
}

server fn load_posts(thread: int) {
    watch(`thread:${thread}`)
    unwatched(() => db.query("select * from posts where thread = ?", thread))
}
```

```quillo
print(unwatched(() => 42))
print(unwatched(() => session()))
```

```output
42
{}
```

### Edge cases

- The value comes back as it is: an error value, null, a list. `?` and `??` work on
  the result.
- Outside a loader it only calls the function: a route, a job or a plain program
  follows nothing anyway.
- Writes inside it are still announced: `unwatched` is about what is read, not what is
  written.
- Nesting is fine; the loader follows nothing from any of it.

```quillo
print(unwatched(() => err("no")) ?? "fallback")
print(unwatched(() => unwatched(() => [1, 2]) | map((n) => n * 10)))
```

```output
fallback
[10, 20]
```

### Errors

An argument that is not a function, or no argument, is a runtime error, not an error
value. A runtime error inside the function is the call's.

```quillo error
print(unwatched(42))
```

```output
line 1: `unwatched` expects a function as argument 1, got int
```

### Chaining

The function is its first argument, so `unwatched` wraps a read rather than taking a
pipeline. Its value goes on into one:

```quillo
print(unwatched(() => ["ann", "bob"]) | map(upper))
```

```output
["ANN", "BOB"]
```

### See also

[watch](/docs/reference/watch/), [publish](/docs/reference/publish/), [live](/docs/reference/live/), [session](/docs/reference/session/)
