---
title: Resume, don't redo
date: 2024-11-22
summary: Server rendering usually means rendering twice: once on the server, then again in the browser to attach the events. A page could instead pick up where the server left off.
tags: design, components, performance
---
Server rendering promised fast pages: send HTML, show it at once. Then the browser downloads the app, runs every component again from the start, compares the result with the HTML it already has, and only then attaches the click handlers. The page is visible early but not usable, and the work is done twice.

### Picking up where the server stopped

If the server sends, with the HTML, the state each component had when it was rendered, the browser does not need to run anything to show the page. It can wait until someone reaches for a component (hovers it, focuses it, taps it), then load that component's code and resume it from that state, on the elements already there.

```quillo
component Counter(start: int = 0) {
    state count = start
    <button @click={() => { count += 1 }}>Clicked {count} times</button>
}
```

For a page with this counter, the server's HTML is the page. Nothing loads until the button is approached, and then only what that component needs.

### What that changes

- **Pages with no components load no script.** A blog post, a docs page, most of a shop.
- **Images do not reload, scroll positions stay, typed text stays typed,** because the browser takes over the elements instead of replacing them.
- **Each component wakes on its own,** so a heavy chart at the bottom of a page costs nothing until it is reached.

### The hard part

It only works if the server and the browser make exactly the same markup from the same state. Numbers must print the same, dates must format the same, and a component that cannot match must say so and be rebuilt, for that component only. That is where the design effort goes.

> **Since then:** Quillo resumes components this way, loading a page's code when a component is first reached. See [Components](/docs/components/).
