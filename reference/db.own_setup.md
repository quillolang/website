# db.own_setup
db.own_setup(str) -> list | error(str)
group: Database

### What it does

Sets up Quillo's own tables (`_quillo_*`) under a separate database role on PostgreSQL
and MySQL/MariaDB *(since 0.8.12)*, run once as that role before the program starts (or
from a one-off setup script). It moves any existing `_quillo_*` tables into Quillo's own
schema (`quillo`, or `quillo_<schema>`) or database (`<db>_quillo`), installs `SECURITY
DEFINER` routines checked with MACs derived from `QUILLO_SECRET`, and exposes restricted
views for `_quillo_migrations` and `_quillo_later` so the program's role cannot read
`_quillo_idempotency` or `_quillo_secret` directly. Returns a list of lines describing
what it set up.

### Examples

```quillo noexec
db.open(env("DATABASE_URL")) | unwrap
print(db.own_setup(env("QUILLO_OWN_DB_URL")))
```

```quillo
print(db.own_setup("postgres://quser:secret@127.0.0.1/app"))
```

```output
err("db: a role holds Quillo's own tables on PostgreSQL and MySQL; SQLite's are held by statement, as they are")
```

### Edge cases

- Requires `QUILLO_SECRET` to be set (to the same secret the running program uses) and a
  role distinct from the program's own role, which is not a superuser and cannot assume
  Quillo's role.
- Only the program's main file may call `db.own_setup`: a taken file under
  `quillo.confirmed` is refused.
- On SQLite, Quillo's own tables are held by statement checks instead, so `db.own_setup`
  returns an error value.

### Errors

An unreachable or misconfigured role, missing `QUILLO_SECRET`, or calling it from a
SQLite program returns an error value; a URL that is not a string is a runtime error.

```quillo error
print(db.own_setup(1))
```

```output
line 1: `db.own_setup` expects the URL of Quillo's role, as text
```

### See also

[db.open](/docs/reference/db.open/), [db.system](/docs/reference/db.system/), [db.migrate](/docs/reference/db.migrate/)
