---
title: The prototype answers its first request
date: 2025-10-30
summary: After a year and a half of notes, Quillo runs. A tree-walking interpreter in Rust reads a .qwe file and serves its routes.
tags: implementation
---
The plan at the end of last year was modest: an interpreter that reads a `.qwe` file and answers the web. It does that now.

```quillo
route GET / = <h1>Hello from Quillo</h1>
route GET /hello/:name = <p>Hello, {name}</p>
```

```sh
quillo run main.qwe
```

The file is parsed, its routes are matched against each request, and the view's markup is rendered to HTML, escaped, and sent back. Small, but every part of the pipeline is real.

### What is in it

- **The parser** for the whole syntax drafted in the notes: routes, views, patterns, pipelines, markup.
- **The interpreter**, walking the syntax tree, as planned. Easy to change, which is what it needs to be for now.
- **The HTTP server,** in Rust, serving many requests at once while one waits.
- **`quillo run --watch`,** which reloads the program when a file changes. Editing a route and refreshing the page is the whole loop.

### What is not, yet

Components in the browser, live data, the checker and the database client are designs, not code. They come next, in roughly that order of risk: the hardest to get right first.

### The first surprise

Writing real programs in it, even small ones, shows things the notes did not. Some syntax reads well on paper and badly in a file of five hundred lines. The interpreter makes those cheap to change, which is the reason it came first.

> **Since then:** the prototype grew into Quillo 0.5, with components that resume in the browser, the checker, live data and a language server. See [Install](/docs/install/).
