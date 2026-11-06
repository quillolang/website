# publish
publish(any...) -> null
group: Jobs and services

### What it does

Announces that something changed, by topic name, so that every page whose `live` data
watched the topic loads it again. Tables and global variables announce themselves when
written (`db:notes`, `var:todos`); `publish` is for everything else: a thread's
replies, a file that was rewritten, data another process changed. Several topics can
be given at once; each is written as text. It gives null. See [Live
data](/docs/components/#live-data).

### Examples

```quillo noexec
server fn load_posts(thread: int) {
    watch(`thread:${thread}`)
    unwatched(() => db.query("select * from posts where thread = ?", thread))
}

server fn reply_to(thread: int, text: str) {
    db.exec("insert into posts (thread, text) values (?, ?)", thread, text)
    publish(`thread:${thread}`)
}
```

```quillo
print(publish("thread:7"))
print(publish("thread:7", "thread:8"))
```

```output
null
null
```

### Edge cases

- A topic nobody watches wakes nothing; publishing in a plain program, or with no
  topics at all, is fine.
- A topic that is not a string is written as text: `publish(7)` is the topic `7`.
  Make topics strings with a prefix, `thread:7`, so they cannot collide with a table's
  `db:` or a global's `var:`.
- A topic is 1 to 256 bytes, of any characters, a comma included (`"search:a,b"` is one
  topic): an empty or a longer one is a runtime error.
- A topic ending in `:*` is a wildcard: `publish("room:*")` wakes every page following
  a topic that starts with `room:`, and `publish("db:*")` every table's. So a topic
  built from a visitor's text must not end in `:*`, or a visitor wakes everything under
  it: keep such text away from the end (`room:${id}:msgs`), or check it.
- With tenants, a topic belongs to the tenant it is published for, so it wakes only
  that tenant's pages; in a mounted program it belongs to the mount. A `publish` made
  for no tenant (a job, a script) wakes no tenant's page.
- Inside `db.transaction` the announcement waits for the commit and is dropped on
  rollback. A global's own (`var:todos`) is not dropped, as the global keeps its value:
  it is made when the outermost transaction ends, whatever its outcome.
- It works inside `parallel`'s functions too, their topics taken in the functions'
  order.
- A page that is prefetched does not call `publish`: a route that publishes is made
  when the link is followed.

```quillo
print(publish(), publish(7), publish("a", "b", "c"), publish("search:a,b"))
```

```output
null null null null
```

### Errors

Any number of topics, of any type, is taken, each as its text. An empty topic, or one
past 256 bytes, is a runtime error, not an error value.

```quillo
print(publish(null, true, { thread: 7 }))
```

```output
null
```

```quillo error
print(publish(""))
```

```output
line 1: `publish`: a topic is a name, and this one is empty
```

```quillo error
print(publish(repeat("x", 300)))
```

```output
line 1: `publish`: a topic is at most 256 bytes, and this one is 300
```

### Chaining

`publish` goes after the write, in the same function, so that a page is woken only
when there is something new to load; it gives null, so it cannot be the last line of a
function whose value matters.

```quillo noexec
server fn rename(id: int, name: str) {
    let row = db.one("update projects set name = ? where id = ? returning *", name, id)
    publish(`project:${id}`)
    row
}
```

### See also

[watch](/docs/reference/watch/), [unwatched](/docs/reference/unwatched/), [live](/docs/reference/live/), [db.transaction](/docs/reference/db.transaction/)
