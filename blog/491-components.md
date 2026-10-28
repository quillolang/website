---
title: 491 components, one file each
date: 2026-10-29
summary: The Quillo UI kit grew from 108 components to 491, with 65 charts from bar charts to an order book, all searchable by tag. And a measurement of what a program pays for holding them.
tags: components, ui, performance
---
The Quillo UI kit started as components to copy into a program: one `.qwe` file each, with its styles, a demo and a browser test. It now has 491.

### What is in it

426 components for pages, forms and apps, in fifteen groups: layout, typography, actions, forms, feedback, overlays, navigation, data, media, commerce, marketing, dashboard, social, scheduling and utilities. And 65 charts: bar, line, pie and their kin, then heatmaps, treemaps, Sankey diagrams and a force-directed network, then a trading set with candlesticks, an order book, a depth chart, RSI, MACD and a stock chart that zooms, pans and follows the pointer.

Every one is tested in headless Chrome, all 491 together on one page, where two components styling the same class, or one widening the page, would show.

### Finding one

Each has a group and tags, and a tag cuts across groups: `forms` is on every input and button, `trading` on the trading charts, `no-js` on every view that adds no JavaScript. The [components page](/components/) searches by name, summary and tag as you type, and the filters stay in the address, so a search can be shared.

### What 491 costs

A page carries only the components it shows. The server holds what the program declares, and the kit now measures that with `scripts/bench.mjs`:

| Components in one program | Start-up | Memory |
|---|---|---|
| 456 | 0.36 s | 143 MB |
| 1,824 (the kit four times) | 1.64 s | 546 MB |

Both grow in a straight line, and serving a page stays under a millisecond at either size. Taking only the files an app uses keeps a process small.

> **Get it:** [quillolang.org/components](/components/), or `curl -O https://quillolang.org/components/quillo-ui.qwe`.
