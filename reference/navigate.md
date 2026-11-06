# navigate
navigate(str) -> null
group: Browser

### What it does

Goes to another address from a component's code, as a click on a link would. On a
page where a component has called `url()`, the address changes without a reload: the
history gets an entry, the page scrolls to the top, and what read `url()` is worked
out again. On a page where none has, the browser loads the page. `"#spot"` goes to an
element of the same page, and `"/page#spot"` to the spot once the new page shows it.
A `javascript:` or `vbscript:` URL is an error, in the browser and on the server
*(since 0.7)*. It gives `null`; on the server it does nothing, since there is no page to
move.

### Examples

```quillo noexec
server fn create_order(items: list) -> int = db.insert("orders", { items: json.stringify(items) })

component Checkout(items: list) {
    state busy = false
    <button disabled={busy} @click={() => {
        busy = true
        let id = create_order(items)
        if is_err(id) { busy = false } else { navigate(`/orders/${id}`) }
    }}>Place order</button>
}
```

```quillo noexec
component Search() {
    state q = ""
    <form @submit={() => navigate(`/results?q=${url_encode(q)}`)}>
        <input value={q}/>
    </form>
}
```

### Edge cases

- With client-side navigation on (something on the page reads `url()`), the same
  address again adds no history entry; a different one does, and `window.scrollTo(0,
  0)` follows. Without it, `navigate` is `location.assign`, a full load that starts
  every state afresh.
- `"#spot"` on the current page scrolls the element into view and sets CSS `:target`,
  as the browser does for a link; `"/page#spot"` waits for the element to appear (a
  few seconds at most, for data that is still loading) and stays at the top if it
  never does.
- The address is relative to the program's mount, so `navigate("/")` under a mounted
  program goes to the mount's root.
- It is called from a handler, `@mount` or a function they call. Written in the
  component's own code it would run on every change of what it reads; there is no
  use for that, and on the server it does nothing.
- On the server, in a route, `redirect` is the way to send the visitor elsewhere;
  `navigate` there gives `null` and the response goes on as written.
- `quillo check` refuses a path that is not a string: `navigate(42)` is `` argument 1
  of `navigate` must be str, got int ``.
- A `javascript:` or `vbscript:` URL is refused however it is written (`"  JaVaScRiPt:"`,
  with tabs or line breaks inside): `navigate(next)` after a sign-in, with
  `?next=javascript:...`, would have run as the page. Another host's address is not
  refused; keep `next` to your own paths with [local_path](/docs/reference/local_path/).

```quillo
print(navigate("/orders/7"))
print(navigate("#top"), type_of(navigate("/")))
```

```output
null
null null
```

### Errors

A path that is not a string, and a `javascript:` or `vbscript:` URL, are runtime
errors, not error values, on the server as in the browser; the refusal names the scheme
it was given.

```quillo error
print(navigate(42))
```

```output
line 1: `navigate` expects a str as argument 1, got int
```

```quillo error
print(navigate("javascript:alert(1)"))
```

```output
line 1: `navigate` is not given a javascript: URL
```

### Chaining

`navigate` ends a handler; the address is often built with a template and
`url_encode`:

```quillo noexec
@click={() => navigate(`/search?q=${url_encode(q)}&page=1`)}
```

### See also

[url](/docs/reference/url/), [redirect](/docs/reference/redirect/), [url_encode](/docs/reference/url_encode/), [ask](/docs/reference/ask/)
