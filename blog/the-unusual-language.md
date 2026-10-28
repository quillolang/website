---
title: The unusual language to solve the web problem
date: 2026-04-30
summary: Most languages are general-purpose and leave the web to frameworks. Quillo goes the other way, a language made of the web's own parts, and that choice explains everything unusual about it.
tags: design, language
---
Here is the web problem in one sentence: a web app is written in several languages at once. HTML for the page, a scripting language for the server and another for the browser, SQL for the data, HTTP between them all, and a framework to glue the pieces together. Each language is fine. The glue is where the time goes, and where the bugs are.

Most new tools attack the glue with more glue: a better framework, a smarter build, a generated client. Quillo makes an unusual choice. It treats the glue as a language problem.

### A language made of the web

```quillo
db.open("app.db")
db.exec(sql`create table if not exists todos
            (id integer primary key, text text)`)

server fn todos() = db.query("select * from todos order by id")
server fn add(text: str) =
    db.exec("insert into todos (text) values (?)", text)

component Todos() {
    state items = live(todos)
    state text = ""
    <form @submit={() => { add(text); text = "" }}>
        <input bind:value={text} placeholder="What next?"/>
        <ul>{for t in items ?? [] => <li key={t.id}>{t.text}</li>}</ul>
    </form>
}

route GET / = <html><body><Todos/></body></html>
```

That is a complete app: the table, the query, the call that changes it, the page, and the update every open page sees when someone adds a todo. One file, checked together, run with one command.

### Why it looks unusual

Each odd-looking choice follows from that one decision:

- **Routes and markup are syntax,** because they are what a web program is made of.
- **No `async` or `await`,** because a web program mostly waits, and waiting should not change how code looks.
- **Errors are values,** because a missing row is an outcome, not an exception.
- **Components resume instead of hydrating,** because the server already did the work.
- **Pages follow the database on their own,** because the language sees both the reads and the writes.
- **One binary,** because the server, the checker and the compiler are one tool.

### What it is not

Quillo is not a general-purpose language, and it does not try to be. It will not write your kernel or your game engine. It keeps the web's own standards (HTTP, HTML, CSS, SQL) and reaches out to Rust or JavaScript when a job needs them. The bet is narrow on purpose: that the web is big enough, and common enough, to deserve a language of its own.

> **Read more:** the [language tour](/docs/language-tour/), or [install Quillo](/docs/install/) and run the app above.
