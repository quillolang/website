# db.connect
db.connect(str | fn, map=) -> map | error(str)
group: Database

### What it does

Opens another database beside the program's own and gives it as a map of the same
functions, called on it: `analytics.query(...)`, `analytics.exec(...)`, `one`,
`transaction`, `migrate`, `tenants` and `tenant_exists`. Any kind works, a SQLite file
or a server URL, with `replicas` in the options as for `db.open`. It has its own
transactions and migrations. The same target again is the same connection, not a new
pool, so a route may call it; a failure to open is an error value.

### Examples

```quillo
db.open("app.db")
db.exec("create table orders (id integer primary key, total integer)")
db.exec("insert into orders (total) values (10), (20)")
let analytics = db.connect("analytics.db")
print(analytics.exec("create table sales (day text, total integer)"))
print(analytics.exec("insert into sales values (?, ?)", "2026-10-29", 30))
print(analytics.query("select * from sales"))
print(analytics.one("select sum(total) as t from sales"))
```

```output
{ changes: 0, last_id: 0 }
{ changes: 1, last_id: 1 }
[{ day: "2026-10-29", total: 30 }]
{ t: 30 }
```

```quillo noexec
db.open("app.db")
let analytics = db.connect(env("ANALYTICS_URL"))
analytics.migrate("migrations/analytics")
db.transaction(() => {
    db.exec("insert into orders ...")
    analytics.transaction(() => analytics.exec("insert into sales ..."))   // its own
})
```

### Edge cases

- The databases are apart: `db` does not see the connection's tables, nor the
  connection `db`'s. To join their rows, fetch both and use `join_on`.
- The same target twice gives the same connection (they compare equal); another
  spelling of the path is another connection.
- A transaction on the connection commits or rolls back on its own, even inside one
  of `db`'s.
- The map has no `error_kind`, `connect`, `system`, `shards` or `atomic`: those are
  `db`'s and take a connection as a value where they need one.
- A connection never reaches the browser (its URL may hold a password).

```quillo
db.open("app.db")
db.exec("create table orders (id integer primary key)")
let analytics = db.connect("analytics.db")
analytics.exec("create table sales (total integer)")
print(db.query("select * from sales"), analytics.query("select * from orders"))
print(db.connect("analytics.db") == analytics, db.connect("./analytics.db") == analytics)
print(db.transaction(() => {
    db.exec("insert into orders default values")
    analytics.transaction(() => { analytics.exec("insert into sales values (1)"); err("no") })
}))
print(db.query("select count(*) as n from orders"), analytics.query("select count(*) as n from sales"))
print(analytics | keys)
```

```output
err("db: no such table: sales") err("db: no such table: orders")
true false
err("no")
[{ n: 0 }] [{ n: 0 }]
["$db", "exec", "query", "one", "transaction", "migrate", "tenants", "tenant_exists"]
```

### Errors

A target that cannot be opened is an error value; calling a function on it is then a
runtime error (`error has no method query`), so check it, or `unwrap` it at the top
of the program. A target that is neither a string nor a function is a runtime error.

```quillo
let c = db.connect("nope/dir/x.db")
print(is_err(c), db.error_kind(c))
print(db.connect("postgres://user:secret@127.0.0.1:1/app") | is_err)
```

```output
true null
true
```

```quillo error
print(db.connect(42))
```

```output
line 1: `db.connect` expects a path, a URL, or a function giving one for each tenant, got int
```

### Chaining

The SQL comes first in a pipeline into the connection's functions:

```quillo
let analytics = db.connect("analytics.db")
analytics.exec("create table sales (total integer)")
analytics.exec("insert into sales values (5), (7)")
print("select sum(total) as t from sales" | analytics.one)
print("select total from sales" | analytics.query | map((r) => r.total))
```

```output
{ t: 12 }
[5, 7]
```

### See also

[db.open](/docs/reference/db.open/), [db.atomic](/docs/reference/db.atomic/), [db.shards](/docs/reference/db.shards/), [db.migrate](/docs/reference/db.migrate/), [join_on](/docs/reference/join_on/)
