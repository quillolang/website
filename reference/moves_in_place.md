# moves_in_place
moves_in_place() -> null
group: Browser

### What it does

At the top of the program *(since 0.8.11)*, makes every page of the program a page of one
app: a same-site link, or `navigate`, fetches the route's page and puts it in place of the
current one, with no load, and Back and Forward do the same. Page states keep their values
across a move, and a component on both pages, with the same props, keeps its state.
Without it, links and `url()` work as before.

### Examples

```quillo noexec
moves_in_place()                       // at the top: links and navigate() move in place

state visits = 0                       // page state: kept across moves

component Cart() {
    state items = 0                    // on every page, the same props: kept too
    <button onclick={() => { items = items + 1 }}>Cart: {items}</button>
}

route GET / = <html><body><a href="/about">About</a> <Cart/></body></html>
route GET /about = <html><body><a href="/">Home</a> <Cart/></body></html>
```

### Edge cases

- The page is fetched read-only, as a prefetch is: a `GET` that would write (a
  `route writes`, or one that writes as it runs) is answered so, and the page is loaded
  as usual.
- The head is the new page's (see [page_head](/docs/reference/page_head/)), its title said
  to a screen reader; Back's scroll and the focus after a move follow the browser's own.
- Links with a modifier key, a `target`, `download` or `data-reload`, and links outside
  the program's mount, load as usual.
- A program's own function named `moves_in_place` hides the builtin, with a warning.
