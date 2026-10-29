# url
url() -> map
group: Browser

### What it does

The address as `{ path, query, hash }`: of the request on the server, and of the
address bar in the browser, where what reads it follows it when it changes. `path` is
the path within the program (under a mount, without the mount's prefix), `query` a map
of the query's keys and values, decoded, and `hash` the part after `#` without the
`#`. Once a component has called it, clicks on same-site links inside components
change the page without reloading, and Back and Forward work.

### Examples

```quillo noexec
component App() {
    state cart = []                               // survives moving between pages
    let path = url().path
    <div>
        <nav><a href="/">Home</a> <a href="/products">Products</a> Cart: {len(cart)}</nav>
        {match split(path, "/") | filter((s) => s != "") {
            [] => <Home/>
            ["products"] => <ProductList/>
            ["products", id] => <ProductPage key={id} id={int(id)} on_add={(p) => { cart = cart + [p] }}/>
            _ => <NotFound {path}/>
        }}
    </div>
}

route GET /*rest = <html><body><App/></body></html>       // every path renders on the server
```

```quillo noexec
component Pager() {
    let page = int(url().query.page ?? "1") ?? 1
    <p>Page {page} <a href={`?page=${page + 1}`}>Next</a></p>
}
```

### Edge cases

- A browser never sends the hash, so on the server it is `""`; a component that shows
  something by the hash is made again in the browser, where it is read.
- A query key given twice keeps the last: `?a=1&a=2` is `{ a: "2" }`. Values are
  text, decoded (`x%20y` is `"x y"`); a missing key is `null`, so `?? "1"` gives a
  default.
- In a plain program, with no request, it is `{ path: "/", query: {}, hash: "" }`.
- In the browser, reading it in a `let`, a statement or the markup follows the
  address: `navigate`, a link in a component, Back and Forward and a changed hash
  all update what read it. A handler reads it once, when it runs.
- Links with a modifier key, a `target`, `download` or `data-reload`, and links
  outside the program's mount or under `/_quillo/`, load as usual.
- `quillo check` refuses arguments: `url(1)` is `` `url` takes 0 arguments, got 1 ``.

```quillo
print(url())
let u = url()
print(u.path, len(u.query), u.query.page ?? "1", u.hash == "")
```

```output
{ path: "/", query: {}, hash: "" }
/ 0 1 true
```

### Errors

`url()` never fails: with no request every field is empty. What is made from it can,
so a query value is converted with a default (`int(q.page) ?? 1`).

```quillo
print(int(url().query.page) ?? 1)
```

```output
1
```

### Chaining

The map is picked apart with fields or a pattern; `path` splits into its parts:

```quillo
let { path, query } = url()
print(path | split("/") | filter((s) => s != ""))
print(query | keys)
```

```output
[]
[]
```

### See also

[navigate](/docs/reference/navigate/), [url_encode](/docs/reference/url_encode/), [split](/docs/reference/split/), [redirect](/docs/reference/redirect/)
