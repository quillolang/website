---
title: The consolidated tech stack
date: 2026-08-11
summary: A typical web app is a dozen tools with a dozen configs, each upgraded on its own schedule. What it looks like when most of them are one language and one binary.
tags: design, architecture
---
Draw the stack of a typical web app and count the boxes. A server framework and its router. A frontend framework, a bundler, a dev server. An ORM or query builder, a migration tool, a validation library on each side. A message broker for anything real-time. An i18n library, a job runner, a process manager, a linter and a type checker. Each is good at its job. Together they are a second project: configs that must agree, versions that must match, and upgrades that break each other.

### The same app, one language

| What a web app needs | Usually | In Quillo |
|---|---|---|
| Routes and request validation | A framework, a router, a schema library | `route` with request patterns and records |
| Pages | A template engine or a frontend framework | `view`, rendered on the server |
| Interactivity | A frontend framework, a bundler, an API layer | `component`, resumed in the browser, and `server fn` |
| Data | A driver, an ORM, a migration tool | `db.*` for SQLite, PostgreSQL and MySQL, and `db.migrate` |
| Real time | A broker and a socket server | `live`, channels, one connection a page |
| Translations | An i18n library | `t()`, with plural rules built in |
| Money | A decimal library | `dec` and `money` |
| Background work | A job runner | Scheduled jobs |
| Checking | A type checker and a linter | `quillo check`, also in the editor |
| Running it | A process manager, a build pipeline | `quillo run`, one binary |

### What consolidation buys

- **One set of rules.** Escaping, errors, types and patterns work the same in routes, pages, components and queries.
- **Checks across the boxes.** A checker that sees routes, markup, components and effects together finds mistakes that live between tools: a prop a component does not take, a component that would need the database in the browser.
- **Nothing to keep in step.** No client generated from an API, no types copied between the server and the browser, no bundler config to upgrade.
- **Small deploys.** One binary and your `.qwe` files.

### What it does not mean

Consolidation is not isolation. Quillo speaks plain HTTP, HTML, CSS and SQL, so a CDN, a load balancer, PostgreSQL or a CSS tool sit beside it as they would beside anything else. Rust is a `.qwer` file away, and a page's own scripts are reachable with `js()`. The aim is fewer boxes by default, not a wall around the ones you choose.

> **Read more:** [Structure](/docs/structure/) in the docs, and the [language tour](/docs/language-tour/).
