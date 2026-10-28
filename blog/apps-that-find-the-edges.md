---
title: Building apps to find the edges
date: 2026-10-28
summary: A forum, a project board, a newsroom, a bank of five services and a booking platform, each built in Quillo to bring out what breaks. Seventy-nine issues so far.
tags: quality, process
---
Tests check what a language's authors thought of. The bugs that matter are in what they did not: the combination of features nobody tried together, the silent wrong answer in the browser, the error message that sends you the wrong way.

So Quillo is being tested the way a language is really used: by building apps in it, with the same instruction each time. Bring out the edge cases, and write them down.

### The apps so far

- **A forum**, the first.
- **Lanes**, a project board.
- **Newsroom**, a CMS.
- **Quillo Bank**, five services calling each other, with an outage test that freezes one mid-call.
- **Quillo Stays**, a booking platform on map and weather services, with guests holding the same nights at once.

Each app has its own report, `FEEDBACK.md` to `FEEDBACK11.md`. Some reports are about questions rather than apps: how pages' bundles are cached, CSS and Tailwind, scaling one service without changing its code.

### What a finding looks like

Every issue gets a number (Q-001 to Q-079 so far), a repro of a few lines verified on a named commit, and a fix or a suggestion. A runnable script replays every repro against each new build and says which are still open. Silent failures come first: wrong output with no error is worse than a crash.

### What it changed

Fixes land on branches named for the report, each with a comment pointing back to its issue. Among them: services whose copies share the calls they answered, readiness checks that walk a service's chain, and component CSS scoped to its component.

The point is not to prove Quillo works. It is to find where it does not, before you do.

> **Read more:** the reports are in the [Quillo repository](https://github.com/quillolang/quillo).
