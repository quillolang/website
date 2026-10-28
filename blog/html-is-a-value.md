---
title: HTML is a value
date: 2024-04-25
summary: Templates are strings with holes in them. What changes when markup is an ordinary value the language can check, pass around and escape on its own?
tags: design, html
---
A template engine works on text. It glues strings together and hopes the result is HTML. That is why escaping is something you remember to do, and why a missing closing tag shows up in the browser instead of at your desk.

JSX showed a better way: write markup as an expression, and let the compiler turn it into calls. The cost is a build step, and a language (JavaScript) where markup was added afterwards. Quillo's idea is to start there.

### Markup in the language

```quillo
view Card(title: str, children) =
    <section.card>
        <h2>{title}</h2>
        {children}
    </section>

route GET / = <Card title="Welcome"><p>No build step.</p></Card>
```

`<section.card>` is a section with the class `card`, a shorthand worth having when half of all markup is classes. `view` names a piece of markup with parameters, which is all a component is when it has nothing to remember.

### What the language can do with it

Because markup is a value, not text:

- **Escaping is not optional.** `{title}` is text, so it is escaped, always. Trusted HTML has to say so, with `raw(...)`, which is easy to search for.
- **Tags are checked.** A `<div>` closed by `</span>` is a mistake the checker finds, before a browser has to guess.
- **Markup is data.** A function can return it, a list can hold it, a `for` can make it: `<ul>{for t in todos => <li>{t}</li>}</ul>`.

### No build step

The server renders views directly. Nothing turns a `.qwe` file into another file before it runs, so what you read is what serves the page.

> **Since then:** views, the `.class` shorthand and escaping by default are part of every Quillo page. See [HTML literals](/docs/language-tour/#html-literals).
