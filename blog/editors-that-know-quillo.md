---
title: Editors that know Quillo
date: 2026-09-17
summary: A language is used in an editor. A language server for hover and checks as you type, and a debugger with breakpoints in routes, views and components.
tags: tools, features
---
A new language lives or dies in the editor. Without hover, go-to-definition and errors as you type, even a good one feels like writing in a text box. Quillo ships both halves of the editor story in its one binary.

### A language server

```sh
quillo lsp
```

It speaks the Language Server Protocol, so any editor that does can use it. It runs the same checks as `quillo check` as you type, and underlines the line: an unknown name, a prop a component does not take, a function that reaches for the database without `with db`. Hover shows a function's signature and a component's props.

### A debugger

```sh
quillo dap
```

`quillo dap` speaks the Debug Adapter Protocol and runs the program as `quillo run` would. In VS Code, F5 in a `.qwe` file.

- **Breakpoints** on statements, in any file the program loads, with conditions, hit counts and logpoints.
- **Runtime errors stop where they happen,** with the variables as they were: the mistakes that would have made a route answer 500.
- **Frames are what you wrote:** a function, a view, a component, or a route such as `GET /notes/:id`.
- **The debug console** runs code in the stopped frame, assignments included.

When the program stops, all of it stops, so no other request runs Quillo code while you look. Views are not cached and nothing is compiled to machine code while debugging, so every breakpoint stops where you expect.

> **Read more:** [Install](/docs/install/) for the editor extension, and the debugging notes in the user guide.
