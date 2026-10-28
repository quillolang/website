---
title: Why the first Quillo will be an interpreter
date: 2024-12-27
summary: A year of design notes, and the plan for turning them into something that runs. The first version will walk the syntax tree, in Rust, and serve its own routes.
tags: design, implementation
---
This year Quillo has been a set of ideas: routes as syntax, HTML as a value, patterns at the door, pipelines, errors you can hold, effects in the signature, one file for both sides, pages that resume and pages that follow the data. Each makes sense on paper. The only way to know if they make sense together is to build them.

### A tree-walking interpreter

The first version will read a `.qwe` file, build its syntax tree, and run it by walking that tree. It is the slowest way to run a language, and the quickest way to change one. When a piece of syntax turns out wrong, an interpreter lets it be fixed in an afternoon, where a compiler would need a week.

Speed still matters. The plan is to make the parts that are hot fast where it counts (the HTTP server, rendering, the database calls) and keep the language itself simple to change until its shape settles.

### In Rust

The runtime has to be a web server, an HTML renderer, a database client and, later, a compiler to JavaScript, in one binary that installs without anything else. Rust gives that, with no garbage-collector pauses in the middle of a request.

### What the prototype must do

- **Serve its own routes**, from one file, with `quillo run`.
- **Render views** to HTML, escaped by default.
- **Match requests** with patterns, and turn them away when they do not fit.
- **Check a program** before it runs, starting with names and routes.

Components in the browser, live data and effects will follow once those hold up. The aim for the first prototype is modest: a language that can answer the web, and a site written in it.

> **Since then:** the prototype came together in late 2025 as a tree-walking interpreter in Rust. Quillo is now at v0.5, and this site is written in it. See [Install](/docs/install/) to try it.
