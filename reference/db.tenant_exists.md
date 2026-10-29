# db.tenant_exists
db.tenant_exists(str) -> bool
group: Database

### What it does

Whether a tenant has a database, when the program's database is one per tenant: the
SQLite file, PostgreSQL schema or MySQL database for that name exists. A tenant's
database is made the first time code runs for it with `with_tenant(name, ...)`, so this
is the check before signing a name up, and the way to tell a real tenant from a
made-up host.

### Examples

```quillo
db.open("data/{tenant}.db")
print(db.tenant_exists("acme"))
with_tenant("acme", () => db.exec("create table settings (plan text)"))
print(db.tenant_exists("acme"), db.tenant_exists("zed"))
```

```output
false
true false
```

```quillo noexec
route POST /signup { form: { name: str } } {
    if db.tenant_exists(name) { reply 409 "That name is taken" }
    with_tenant(name, () => db.exec("insert into settings (plan) values ('free')"))
    redirect(`https://${name}.example.com/`)
}
```

### Edge cases

- A name that cannot be a tenant's (anything but lowercase letters, digits, `-` and
  `_`, at most 63, starting with a letter or a digit) is `false`, never an error: a
  request's host may say anything.
- It works for any tenant and for none: it looks at the folder, not a tenant's
  database.
- With a function naming each tenant's database, it is `true` once that database has
  been made.
- It never makes the database: asking about `zed` leaves `db.tenants()` as it was.

```quillo
db.open("data/{tenant}.db")
with_tenant("a-b_1", () => db.query("select 1"))
print(db.tenant_exists("a-b_1"), db.tenant_exists("Acme"), db.tenant_exists("../a-b_1"), db.tenant_exists(""))
print(with_tenant("a-b_1", () => db.tenant_exists("zed")), db.tenants())
let registry = db.connect("registry.db")
registry.exec("create table tenants (name text, url text)")
registry.exec("insert into tenants values ('acme', 'data/acme.db')")
db.open((t) => registry.one("select url from tenants where name = ?", t).url)
print(db.tenant_exists("acme"))
with_tenant("acme", () => db.exec("create table t (a)"))
print(db.tenant_exists("acme"), db.tenant_exists("zed"))
```

```output
true false false false
false ["a-b_1"]
false
true false
```

### Errors

A program whose database is not one per tenant gets a runtime error, as does a name
that is not a string.

```quillo error
db.open("app.db")
print(db.tenant_exists("acme"))
```

```output
line 2: `db.tenant_exists` needs a database per tenant: db.open("data/{tenant}.db")
```

### Chaining

```quillo
db.open("data/{tenant}.db")
with_tenant("acme", () => db.query("select 1"))
print(["acme", "zed"] | filter(db.tenant_exists))
print("acme" | db.tenant_exists)
```

```output
["acme"]
true
```

### See also

[db.tenants](/docs/reference/db.tenants/), [with_tenant](/docs/reference/with_tenant/), [tenant](/docs/reference/tenant/), [tenant_from](/docs/reference/tenant_from/), [db.open](/docs/reference/db.open/)
