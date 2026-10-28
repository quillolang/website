---
title: What if routes were the language?
date: 2024-03-02
summary: Most web code is a router, a template engine and a validator glued together. The first idea behind Quillo: make those three the syntax itself.
tags: design, routes
---
Open almost any web project and count the languages in it. There is the host language, then a small one for the router (strings with colons in them), another for templates, another for validation schemas, and often a fourth for the build that ties them together. Each has its own rules about quoting, escaping and errors, and none of them knows about the others.

The question Quillo starts from is simple: what if the parts every web program has were the language itself, and not libraries written in it?

### A route is a declaration

In most frameworks a route is a function call made at start-up, and the path is a string the framework parses later. Typos in it are found when someone visits the page.

```quillo
route GET /hello/:name = <h1>Hello, {name}</h1>
```

Here the route is a statement of the program, like a function. `:name` is a variable the body can use, and the checker knows it is there. A route can name a type, and a path that does not fit is simply not this route:

```quillo
route GET /orders/:id(int) = show_order(id)
route GET /orders/:id = respond(404, "no such order")
```

### Why it matters

When routes are syntax, tools can see them. A checker can list every route, find two that can never be reached, and know which parameters each body uses. An editor can jump from a link to the route that answers it.

It also changes how small a web program can be. A whole service fits in one file that reads from top to bottom: the data, the functions, the pages and the routes that serve them, with nothing generated and nothing configured elsewhere.

### What it is not

This is not a new idea about the web. HTTP stays HTTP, HTML stays HTML, and a page still works without JavaScript. The bet is narrower: that the glue between them deserves to be a language, with one set of rules, instead of four.

> **Since then:** routes, typed path parameters and request patterns are how every Quillo program answers the web. See [Routes](/docs/routes/).
