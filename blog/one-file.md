---
title: One file for the server and the browser
date: 2024-09-30
summary: Interactive pages usually mean two programs, an API between them, and types kept in step by hand. What if a component and the server function it calls sat in the same file?
tags: design, components
---
The moment a page needs a button that does something without reloading, the program splits in two. There is the server, which owns the data, and a browser app, which owns the page. Between them sits an API that both sides must agree on, by hand.

The question for Quillo: can a page be interactive and still be one program?

### Components with state

```quillo
component Counter(start: int = 0) {
    state count = start
    <button @click={() => { count += 1 }}>Clicked {count} times</button>
}

route GET / = <html><body><Counter start={3}/></body></html>
```

A `component` is a view with `state`. The server renders it to HTML like any view, so the page arrives complete and works without JavaScript where it can. The same code, compiled for the browser, makes it interactive.

### Calling the server is calling a function

```quillo
server fn add_note(text: str) with db =
    db.exec("insert into notes (text) values (?)", text)

component NoteBox() {
    state draft = ""
    <form @submit={() => { add_note(draft); draft = "" }}>
        <input bind:value={draft}/>
    </form>
}
```

`server fn` marks a function the browser may call. In a component, the call is a request to the server, checked against the parameter types on the way in. There is no route to write for it, no client to generate and no `async` to add: the compiler waits where it must.

### The line that stays

Not everything can cross. A component cannot read the database or the environment, and the language says so when the program loads, instead of shipping a secret to every visitor. One file, but the boundary is still there, and checked.

> **Since then:** components, `state` and `server fn` work this way in Quillo, with the browser's limits checked when a program loads. See [Components](/docs/components/) and [Server functions](/docs/components/#server-functions).
