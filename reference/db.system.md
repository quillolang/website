# db.system
db.system(str) -> null | error(str)
group: Database

### What it does

Names the system database: where Quillo keeps its own tables, the scheduled jobs
(`_quillo_jobs`), calls made later (`_quillo_later`), the decisions of `db.atomic`
(`_quillo_atomic`) and the calls a service answered. Without it they go to the
program's database, or, when that is one per tenant, to `$QUILLO_SYSTEM_DB` or a
SQLite file `quillo-system.db` next to the program. Several servers of one program
share one system database, so give them a server URL. It gives `null` when the
database is open and an error value when it is not.

### Examples

```quillo
print(db.system("system.db"))
print(db.query("select 1 as still_the_program_database"))
```

```output
null
[{ still_the_program_database: 1 }]
```

```quillo noexec
db.open("data/{tenant}.db")          // a database per tenant: jobs cannot live there
db.system(env("SYSTEM_DB_URL"))      // one for every server of the program
```

### Edge cases

- It keeps Quillo's tables apart from the program's even when there is one database.
- The program's `db` calls do not go to it: it is not another `db.open`.
- A file that cannot be opened is an error value; the program goes on.
- Calling it again with the same target is harmless.

```quillo
print(db.system("system.db"), db.system("system.db"))
print(db.system("nope/dir/system.db") | is_err)
```

```output
null null
true
```

### Errors

A path that cannot be opened is an error value; a target that is not a string is a
runtime error.

```quillo error
print(db.system(1))
```

```output
line 1: `db.system` expects a path or a database URL
```

### Chaining

Called once, at the top of the program, after `db.open`:

```quillo
print("system.db" | db.system)
```

```output
null
```

### See also

[db.open](/docs/reference/db.open/), [db.atomic](/docs/reference/db.atomic/), [db.tenants](/docs/reference/db.tenants/), [schedule](/docs/reference/schedule/)
