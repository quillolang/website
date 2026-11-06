# db.open
db.open(str | fn, map=) -> null | error(str)
group: Database

### What it does

Opens the program's database, the one `db.exec`, `db.query`, `db.one` and the rest use:
a SQLite file by its path (from the program's folder, wherever Quillo runs; `":memory:"`
for one that lives in memory), or a server by URL (`postgres://...`, `mysql://...`,
`mariadb://...`). It gives `null` when the database is open and an error value when it
is not, in which case the database stays as it was: without any `db.open` that is
`$QUILLO_DB`, or else SQLite in memory. A target with `{tenant}` in it, or a function
giving a target for each tenant, is a database per tenant (see
[db.tenants](/docs/reference/db.tenants/)). The options map takes `replicas`, a list of
URLs that take a PostgreSQL or MySQL database's pure reads: a `select` that calls a
function that may write (`nextval`, or one made with `create function`) goes to the
primary.

### Examples

```quillo
print(db.open("app.db"))
db.exec("create table todos (id integer primary key, text text not null)")
db.exec("insert into todos (text) values (?)", "milk")
print(db.query("select * from todos"))
```

```output
null
[{ id: 1, text: "milk" }]
```

```quillo noexec
db.open(env("DATABASE_URL"))                       // stops the program if it cannot open
db.open("postgres://user:pass@host:5432/app", { replicas: [env("REPLICA_1")] })
db.open("data/{tenant}.db")                        // a SQLite file per tenant
```

### Edge cases

- A second `db.open` switches the program to the other database; the tables of the
  first are not there.
- Switching is announced to live pages: every page showing the program's database's
  rows (every tenant's, whichever tenant's request switched it) asks again, and a live
  call is not answered with rows shared from the old database. It is said at once, so a
  transaction rolled back does not undo it.
- `":memory:"` is a fresh, empty database each time the program starts.
- A SQLite file it makes is its owner's alone (mode 0600), and so are its `-wal` and
  `-shm` *(since 0.7: every user of the machine could read sessions and password
  hashes)*. A file there already keeps its own mode.
- A path that cannot be opened (a folder that does not exist, a wrong password) is an
  error value, and the program goes on with the database it had. As the program starts, a
  `db.open` whose error nothing takes (alone on a line) stops it, with the reason *(since
  0.7)*: take the error, `let r = db.open(...)`, to go on without it.
- Only `postgres://`, `postgresql://`, `mysql://` and `mariadb://` are servers; any
  other text is a SQLite file's path. A host may be an IPv6 address,
  `mysql://app@[::1]:3306/app`.
- A MySQL or MariaDB database that is not there is an error value (`Unknown database
  'shop'`), as on PostgreSQL, so a typo in a URL makes no empty database; a tenant's is
  made by the driver when the program makes the tenant.
- `files()` and `quillo serve` never send a SQLite file, whatever its name or folder;
  `file("app.db")` sends one on purpose. The program's `write_file`, `delete_file` and
  `save_upload` refuse the databases it has open, with their `-wal`, `-shm` and
  `-journal` files and the folder holding them.
- Without `db.open` the database is SQLite in memory, so `db.query` works in any
  program, and its data is gone at restart.

```quillo
print(db.query("select 1 as x"))
print(db.open("a.db"), db.exec("create table t (n integer)"), db.exec("insert into t values (1)"))
print(db.open("b.db"), db.query("select * from t"))
print(db.open("a.db"), db.query("select * from t"))
print(db.open("nope/dir/app.db") | is_err, db.query("select * from t"))
print(db.open(":memory:"), db.query("select * from t"))
```

```output
[{ x: 1 }]
null { changes: 0, last_id: null } { changes: 1, last_id: 1 }
null err("db: no such table: t")
null [{ n: 1 }]
true [{ n: 1 }]
null err("db: no such table: t")
```

### Errors

A target that cannot be opened is an error value; the program still runs, on the
database it had before. A target that is neither a string nor a function is a runtime
error, as is a `replicas` list for a SQLite file.

```quillo
let r = db.open("postgres://user:secret@127.0.0.1:1/app")
print(is_err(r), db.error_kind(r))
```

```output
true connection
```

```quillo error
print(db.open(42))
```

```output
line 1: `db.open` expects a path, a URL, or a function giving one for each tenant, got int
```

### Chaining

`db.open` is called once, at the top of the program; `unwrap` after it turns a failure
into a stop with the reason:

```quillo
print("a.db" | db.open | unwrap)
print("select 2 as two" | db.one)
```

```output
null
{ two: 2 }
```

### See also

[db.connect](/docs/reference/db.connect/), [db.migrate](/docs/reference/db.migrate/), [db.exec](/docs/reference/db.exec/), [db.query](/docs/reference/db.query/), [db.tenants](/docs/reference/db.tenants/), [unwrap](/docs/reference/unwrap/)
