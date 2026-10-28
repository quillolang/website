---
title: Pages that follow the database
date: 2024-12-09
summary: Real-time pages usually need a message broker, topics and code on both ends. If the language sees what a page read and what a request wrote, it can do the wiring itself.
tags: design, components, realtime
---
Making a page update when someone else changes the data is one of the most requested features, and one of the most plumbing-heavy. A broker, a channel per kind of change, code that publishes after each write, and code in the page that subscribes and merges. Miss one publish and a page goes stale, quietly.

### What a loader reads, and what a request writes

```quillo
server fn load_notes() with db = db.query("select * from notes order by id")

component Notes() {
    state notes = live(load_notes)
    <ul>{for n in notes => <li key={n.id}>{n.text}</li>}</ul>
}
```

`live(load_notes)` asks for the notes now and whenever they may have changed. The language can know when that is: the loader read the `notes` table, and every `insert`, `update` and `delete` goes through `db.*`, so the server sees each write to it. When one happens, open pages that read `notes` ask again, and get only what changed.

### What the programmer no longer writes

- **No publish after each write.** The write itself is the signal.
- **No topics to name and keep in step.** The tables a loader reads are its topics.
- **No broker to run** for a single server. One connection per page carries the changes.

### Where it needs help

Not everything is a table. Changes made by another program, or data from another service, are invisible to it, so there must be a way to announce a change by hand, and to follow it. And a busy table should not wake every page that ever read it, which means being able to narrow what a loader follows.

> **Since then:** `live` works this way in Quillo, with `publish` and `watch` for what the database does not show. See [Live data](/docs/components/#live-data) and [Real time](/docs/realtime/).
