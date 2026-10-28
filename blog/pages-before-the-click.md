---
title: Pages before the click
date: 2026-01-31
summary: A link someone points at is a link they are about to follow. Fetching it then makes the next page appear at once, as long as fetching it can never change anything.
tags: performance, features
---
Between pointing at a link and clicking it, a person takes a few hundred milliseconds. A page can arrive in that time. Quillo uses it: every page it serves asks for the pages it links to when a link is pointed at, pressed, touched or reached with Tab.

### Nothing to write

There is no attribute to add and no router to configure. A same-site link pointed at for 65 ms is fetched. Browsers with speculation rules keep the page for the navigation themselves, and others keep it in their cache for 30 seconds. By the time the click lands, the page is there.

### Fetching ahead must change nothing

The danger of prefetching is a `GET` that does something: a logout link, a counter, a "mark as read". Fetch it ahead and you have logged someone out by their pointing at a menu.

So a route fetched ahead of a click may read but not write. A database write, a global assignment, a cookie, a file, a `publish`, a call to another service: any of these stops it, and the prefetch is answered 503, which the browser drops. When the link is actually followed, the page is made as usual. A route that writes on `GET` is still wrong, but it is no longer dangerous.

### What is left alone

Links to other sites, links with `target` or `download`, links to the same page, anything inside `data-no-prefetch`, and every link on a connection that asks to save data. `quillo run --no-prefetch` turns it off.

On a docs site or a shop, where most clicks are links, it makes navigation feel instant for the cost of a few extra requests.

> **Read more:** [Prefetching](/docs/prefetching/) in the docs.
