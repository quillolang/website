---
title: A checker that knows your routes
date: 2025-09-08
summary: Type checkers stop at the edge of the language. When routes, markup and effects are the language, the checker can see the whole web program.
tags: design, checking, tools
---
A type checker for a web framework sees functions. It does not see the router's path strings, the template's variables, the SQL in a string or which handler can reach the database. Those are where web bugs live, and they are invisible to it.

When those parts are syntax, a checker can read them. That is the plan for `quillo check`: run before the program, and find the mistakes a web program actually makes.

### What it should catch

```sh
quillo check main.qwe
```

- **Names:** a view, function or variable that does not exist, or one that hides a builtin and changes what a later line means.
- **Routes:** a parameter the body uses that the path does not have.
- **Markup:** a tag closed by the wrong one, a component given a prop it does not take, or missing one it needs.
- **Effects:** a function that reaches for the database without saying `with db`.
- **The browser:** a component that would need the database, the environment or a server secret in the browser.
- **Errors:** a `?` that would pass on an error of the wrong kind.

### Before running, and while typing

The same checks run before `quillo run` starts, so a program with a mistake in it does not start half-working. A language server can run them as you type and underline the line.

### What it will not be

A full type system with generics everywhere is not the goal. Types are checked when values are made and when functions are called. The checker's job is the mistakes that are cheap to find early and expensive to find in production.

> **Since then:** `quillo check` does this, before every `quillo run` and in editors. See [Checking](/docs/checking/).
