---
title: The illusions of separation of concerns, until they become the concerns
date: 2026-11-02
summary: Most of what we call separation of concerns is separation of files, languages and processes. Each cut makes a seam, and an unchecked seam becomes the concern. Separate by meaning, and let the tool check the cuts.
tags: design, architecture
---
Separation of concerns is a good idea about ideas: code that computes a price should not also decide how the price is shown. Somewhere along the way it became an idea about files. HTML here, CSS there, JavaScript in a third place. The frontend in one repository and the backend in another. The service in its own process, the queries behind an ORM, the configuration in YAML.

Each of those cuts is a seam, and a seam is a contract that two sides keep by agreement. When nothing checks the agreement, keeping it becomes a job of its own. That is the illusion: the concerns were not separated, they were moved into the gap between the parts, where no tool looks.

### The page and the server

Split a page from its server, and you get an endpoint, a fetch call, and two descriptions of the same data that agree by hope. Rename a field on one side and the other finds out in production.

In Quillo the page calls the server's function, and the checker reads both sides:

```quillo
server fn add_task(title: str) -> str ! str {
    if trim(title) == "" { return err("A task needs a title") }
    db.exec("insert into tasks (title) values (?)", title)
    title
}

component NewTask() {
    state title = ""
    state said = ""
    <form @submit={() => {
        let r = add_task(title)
        said = is_err(r) ? r.error : `added ${r}`
    }}>
        <input value={title} @input={(e) => { title = e.value }}/>
        <button>Add</button>
        <p>{said}</p>
    </form>
}
```

Call it with a number, from a component in another file, and `quillo check` says so before anything runs:

```
ui/bad.qwe:3: error: argument `title` of `add_task` must be str, got int
```

The seam is still there: the call goes over HTTP. It is just not yours to keep.

### The app and the service

A service is the same seam with a deployment in it. `service billing = "billing.qwe"` makes `billing.add(1, 2)` a call, in one process or, with `--split`, across processes, and the checker holds the call to the function:

```
app.qwe:2: error: `billing.add` takes 2 arguments, got 3
```

This week's report (FEEDBACK40) found where that separation was still an illusion. An app whose service ran on another machine still needed the service's whole source beside it, bodies included. A syntax error in a route of the service's own, one the app never called, stopped the app from starting. The app was separate on paper and coupled in fact. In 0.7 the app reads a service's file only for its `server fn` headers, and when the file is not there, it asks the running service for them, signed, as any call is.

### The program and its database

Here the seam is SQL, and the report on databases (FEEDBACK43) found two concerns that had leaked across it. `sql_name` quoted a column for the program's own database, SQLite, while the query went to a MySQL connection, which reads `"title"` as text. Every row came back with the column's name as its value, and no error. And `db.error_kind` recognised a duplicate key by PostgreSQL's English message, so on a server set up in German it said nothing at all.

Both were the same mistake: the code that depended on which database it was talking to had been kept apart from the code that knew. In 0.7, `shop.sql_name(col)` quotes for the connection it is called on, and the kind of an error is read from its SQLSTATE code, not its words.

### Separating by meaning

The separation that pays is the one about meaning: what a piece of code is allowed to touch. Quillo writes it into the function:

```quillo
fn daily_report(day: str) with db = db.query("select title from tasks where day = ?", day)

fn send_report(day: str) with db {
    let rows = daily_report(day)
    http.post("https://hooks.example.com/report", { rows })
}
```

```
report.qwe:5: error: `http.post` needs the http effect, but `send_report` is declared `with db`
```

That is a separation of concerns the language enforces, in the check and when the program runs. Nothing called inside can widen it, and in 0.7 a Rust plugin has to say what it does before a `with` function may call it.

### Where the seams still are

Not every seam can be checked. A JSON body from another company's API, a JavaScript library, a database another program writes to: the shapes there are only as good as what you check when they arrive. Quillo's answer is to make those few seams obvious and the rest disappear, not to pretend there are none.

Cut where it means something, and keep the cut where your tools can see it. Otherwise the separation becomes the work.

> **Read more:** [Microservices](/docs/microservices/), [Databases](/docs/database/), and [Effects](/blog/effects/).
