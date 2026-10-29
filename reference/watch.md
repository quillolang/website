# watch
watch(any...) -> null
group: Jobs and services

### What it does

Inside a `live` loader, subscribes the page to a topic, so that `publish` of that
topic runs the loader again. The tables and globals a loader reads are followed by
themselves; `watch` is for a topic of your own, usually one narrower than a table: one
thread, one project. Several topics can be given at once; each is written as text. It
gives null. See [Live data](/docs/components/#live-data).

### Examples

```quillo noexec
server fn load_posts(thread: int) {
    watch(`thread:${thread}`)
    unwatched(() => db.query("select * from posts where thread = ?", thread))
}

component Thread(id: int) {
    state posts = live(load_posts, id)
    <ul>{posts | map((p) => <li>{p.text}</li>)}</ul>
}
```

```quillo
print(watch("thread:7"))
print(watch("thread:7", "thread:8"))
```

```output
null
null
```

### Edge cases

- Outside a loader it does nothing: a route, a job or a plain program has no page to
  subscribe.
- A topic that is not a string is written as text: `watch(7)` is the topic `7`, the
  one `publish(7)` names.
- Inside `unwatched(f)`, a `watch` in `f` is not recorded either; call `watch` outside
  it, as in the example above.
- A page may follow at most 256 topics; past that, the rest hear nothing. With
  tenants, the topic watched is the tenant's own.

```quillo
print(watch(), watch(7), unwatched(() => watch("ignored")))
```

```output
null null null
```

### Errors

It never fails: any number of topics, of any type, is taken.

```quillo
print(watch(null, { thread: 7 }))
```

```output
null
```

### Chaining

`watch` goes first in the loader, then the reads it should not follow by table inside
`unwatched`, then the value:

```quillo noexec
server fn load_project(id: int) {
    watch(`project:${id}`)
    unwatched(() => db.one("select * from projects where id = ?", id))
}
```

### See also

[publish](/docs/reference/publish/), [unwatched](/docs/reference/unwatched/), [live](/docs/reference/live/)
