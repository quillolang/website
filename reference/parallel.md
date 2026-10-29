# parallel
parallel(any...) -> list
group: Browser

### What it does

Calls several functions at once and gives their results as a list, in the order the
functions were given. Their waits overlap: database calls, `http.*` and `sleep` on the
server, `server fn` calls in the browser (where it is `Promise.all`). Their computing
does not, since Quillo code runs one piece at a time, so `parallel` shortens waiting,
not arithmetic. The functions may be given one by one or as one list.

### Examples

```quillo
fn slow(v) { sleep(100); v }
let t = now()
let [a, b, c] = parallel(() => slow(1), () => slow(2), () => slow(3))
print(a, b, c, now() - t < 250)
print(parallel([() => "x", () => "y"]))
```

```output
1 2 3 true
["x", "y"]
```

```quillo noexec
server fn load_user(id: int) = db.one("select * from users where id = ?", id)
server fn load_orders(id: int) = db.query("select * from orders where user_id = ?", id)

component Account(id: int) {
    state data = parallel(() => load_user(id), () => load_orders(id))   // one round trip's wait
    let [user, orders] = data
    <div>
        <h2>{user.name}</h2>
        <button @click={() => { data = parallel(() => load_user(id), () => load_orders(id)) }}>Refresh</button>
        <ul>{for o in orders => <li key={o.id}>{o.total}</li>}</ul>
    </div>
}
```

### Edge cases

- Results come back in the order given, whichever finished first.
- An error value a function returns, or passes on with `?`, is its result like any
  other; a runtime error in one function stops the whole call.
- No functions gives `[]`.
- Inside `db.transaction` the functions run one after another, so their SQL is part of
  the transaction.
- In a component it may be called from an event handler or as a `state` initializer
  (on the server while rendering, in the browser on navigation). In a `let` of the
  component it is refused when the program loads: `` `parallel` waits on the server, so a
  component can only call it from an event handler (@click={() => { ... }}) or to set
  state: state x = parallel(...) ``.
- `quillo check` does not look at the arguments (`any...`): a value that is not a
  function is found when the call runs.

```quillo
print(parallel(() => 1, () => "two"))
print(parallel(() => { sleep(50); "slow" }, () => "fast"))
print(parallel(() => err("boom"), () => int("x")?, () => 3))
print(parallel())
```

```output
[1, "two"]
["slow", "fast"]
[err("boom"), err("not an int: \"x\""), 3]
[]
```

### Errors

An argument that is not a function is a runtime error, not an error value, with the
argument's number. A function that fails with a runtime error fails the call.

```quillo error
print(parallel(1, () => 2))
```

```output
line 1: `parallel` takes functions to call, like parallel(() => a(), () => b()); argument 1 is int
```

```quillo error
print(parallel(() => 1, () => upper(42)))
```

```output
line 1: `upper` expects a str as argument 1, got int
```

### Chaining

A list of functions pipes in as the one argument, and the result is a list:

```quillo
let jobs = [1, 2, 3] | map((n) => () => n * 10)
print(jobs | parallel | sum)
let [first, second] = parallel(() => "a", () => "b")
print(first + second)
```

```output
60
ab
```

### See also

[sleep](/docs/reference/sleep/), [live](/docs/reference/live/), [idempotent](/docs/reference/idempotent/), [http.get](/docs/reference/http.get/)
