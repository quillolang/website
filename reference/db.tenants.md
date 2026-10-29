# db.tenants
db.tenants() -> list | error(str)
group: Database

### What it does

The names of the tenants that have a database, when the program's database is one per
tenant: `db.open("data/{tenant}.db")` lists the SQLite files there are, a
`?schema=t_{tenant}` target the PostgreSQL schemas, `mysql://host/app_{tenant}` the
MySQL databases. A tenant's database is made, and migrated, the first time code runs
for it with `with_tenant(name, ...)`, as when signing the tenant up.

### Examples

```quillo
db.open("data/{tenant}.db")
print(db.tenants())
with_tenant("acme", () => db.exec("create table settings (plan text)"))
with_tenant("beta", () => db.exec("create table settings (plan text)"))
print(db.tenants())
print(db.tenants() | map((t) => with_tenant(t, () => db.exec("insert into settings values (?)", "free"))))
```

```output
[]
["acme", "beta"]
[{ changes: 1, last_id: 1 }, { changes: 1, last_id: 1 }]
```

### Edge cases

- No tenant yet is `[]`.
- The list is of databases that exist, in name order; it works for any tenant and for
  none, since it reads the folder, not a tenant's database.
- `db` calls for no tenant (the bare domain, a script) are error values, not runtime
  errors: there is no database to ask.
- Where a function says where each tenant's database is
  (`db.open((tenant) => ...)`), or a `postgres://host/app_{tenant}` target names a
  database each, the list cannot be read: keep it yourself. That call is a runtime
  error.

```quillo
db.open("data/{tenant}.db")
print(db.tenants())
print(db.exec("create table t (a)"))
with_tenant("zed", () => db.query("select 1"))
with_tenant("acme", () => db.query("select 1"))
print(db.tenants(), with_tenant("acme", () => db.tenants()))
```

```output
[]
err("db: the database is one per tenant ({tenant} in its target), and this code runs for none: see tenant_from and with_tenant")
["acme", "zed"] ["acme", "zed"]
```

### Errors

A program whose database is not one per tenant, or one where a function names each
tenant's database, gets a runtime error.

```quillo error
db.open("app.db")
print(db.tenants())
```

```output
line 2: `db.tenants` needs a database per tenant: db.open("data/{tenant}.db")
```

### Chaining

A job for every tenant:

```quillo
db.open("data/{tenant}.db")
write_file("migrations/001_s.sql", "create table settings (plan text)")
db.migrate()
with_tenant("acme", () => db.exec("insert into settings values ('pro')"))
with_tenant("beta", () => db.exec("insert into settings values ('free')"))
print(db.tenants() | map((t) => [t, with_tenant(t, () => db.one("select plan from settings").plan)]))
```

```output
[["acme", "pro"], ["beta", "free"]]
```

### See also

[db.tenant_exists](/docs/reference/db.tenant_exists/), [with_tenant](/docs/reference/with_tenant/), [tenant](/docs/reference/tenant/), [tenant_from](/docs/reference/tenant_from/), [db.open](/docs/reference/db.open/), [db.migrate](/docs/reference/db.migrate/)
