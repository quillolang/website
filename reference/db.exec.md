# db.exec
db.exec(str, any...) -> map | error(str)
group: Database

### What it does

Runs a statement that changes the database (`insert`, `update`, `delete`, `create
table`) and gives `{ changes, last_id }`: how many rows it matched, and the id of the
one row an `insert` made (`null` after anything else, and always on PostgreSQL, where
`insert ... returning id` with [db.one](/docs/reference/db.one/) does that). The two
mean the same on SQLite, PostgreSQL and MySQL. Values go in through `?`, in
order, or `:name` from one map, never into the SQL text itself. A SQL failure is an
error value whose text starts `db: `, so `?` passes it on and `??` gives a default.

### Examples

```quillo
db.open("app.db")
print(db.exec("create table todos (id integer primary key, text text not null, done bool default false)"))
print(db.exec("insert into todos (text) values (?)", "milk"))
print(db.exec("insert into todos (text) values (:text)", { text: "eggs" }))
print(db.exec("update todos set done = true where id = ?", 1))
print(db.exec("delete from todos where done = ?", true))
print(db.query("select * from todos"))
```

```output
{ changes: 0, last_id: null }
{ changes: 1, last_id: 1 }
{ changes: 1, last_id: 2 }
{ changes: 1, last_id: null }
{ changes: 1, last_id: null }
[{ id: 2, text: "eggs", done: false }]
```

### Edge cases

- `changes` is the rows the statement matched: an `update` that sets a value a row
  already has counts that row (on MySQL too), an upsert's or a `replace`'s row counts
  once, and a read or a schema statement counts 0.
- `last_id` is `null` after an `insert` of several rows, an upsert that updated, an
  `update` or a `delete`: it never names an older row.
- With values, the SQL is one statement: more after its first `;` is an error, on every
  database (SQLite ignored the rest before 0.8.1). Without values the whole text runs statement by statement
  (a seed file: `db.exec(read_file("seed.sql"))`), and `changes` is the last one's. A
  trigger's, function's or procedure's body (`begin ... end`, `$$ ... $$`) is one
  statement with the rest.
- A different number of values than `?` marks is an error value, placeholders given no
  values too; so is a `:name` the map does not have. Extra keys in the map are ignored.
  A map is values by name only where the SQL has names: given to SQL with none, it is
  no value, and given for a lone `?`, it is that value, stored as JSON.
- SQLite also reads `@name`, `$name` and `#name` from the map, and `?1`, `?2` as the
  values in that place. On MySQL `@name` is a variable of the session, so a map with that
  name is refused: write `:name`.
- `insert ... returning id` runs, on SQLite too; its rows are `db.one`'s and
  `db.query`'s.
- A list or a map as a value is stored as JSON text; `true` is stored as 1; a decimal
  and a float as their text or number, by the column's type. NaN and the infinities are
  refused, naming them, since SQLite keeps NaN as null and MySQL refuses both; `-0.0`
  is stored as `0.0`.
- An error value given as a value is not stored but given back as the error it was, so
  `int("4O")` never becomes a row; a function is refused.
- SQL with no statement in it (`""`, only spaces or comments) is an error value.

```quillo
db.open("app.db")
db.exec("create table t (id integer primary key, a text)")
print(db.exec("insert into t (a) values ('x')"), db.exec("update t set a = 'y' where id = 99"))
print(db.exec("insert into t (a) values (?); insert into t (a) values ('skipped')", "one"))
print(db.exec("insert into t (a) values ('two'); insert into t (a) values ('three')"))
print(db.query("select a from t order by id") | map((r) => r.a))
print(db.exec("insert into t (a) values (?)", "a", "b"))
print(db.exec("insert into t (a) values (:a)", { b: 1 }))
print(db.exec("insert into t (a) values (?) returning id", "r"))
print(db.exec("insert into t (a) values (?)", [1, 2]), db.one("select a from t order by id desc limit 1"))
print(db.exec(""))
print(db.exec("insert into t (a) values ('p'), ('q')"), db.exec("update t set a = a where id = 1"))
print(db.exec("insert into t (a) values (?)", math.nan))
print(is_err(db.exec("insert into t (a) values (?)", int("4O"))), db.one("select count(*) as n from t where a = '4O'"))
```

```output
{ changes: 1, last_id: 1 } { changes: 0, last_id: null }
err("db: the SQL has more than one statement: a query, or db.exec given values, runs one (db.exec of the text alone, without values, runs them all)")
{ changes: 1, last_id: 3 }
["x", "two", "three"]
err("db: the query has 1 parameter, got 2")
err("db: no value for :a")
{ changes: 1, last_id: 4 }
{ changes: 1, last_id: 5 } { a: "[1,2]" }
err("db: the SQL has no statement in it (it is empty, or only comments)")
{ changes: 2, last_id: null } { changes: 1, last_id: null }
err("db: value 1 is NaN, which cannot be stored: SQLite keeps NaN as null and MySQL refuses NaN and the infinities, so no database is given one")
true { n: 0 }
```

### Errors

Every failure the database reports is an error value: a missing table, a broken
constraint, a syntax error. [db.error_kind](/docs/reference/db.error_kind/) tells a
unique or foreign key failure from the rest. SQL that is not a string is a runtime
error.

```quillo
db.open("app.db")
db.exec("create table users (email text unique not null)")
db.exec("insert into users values ('a@x.io')")
let r = db.exec("insert into users values (?)", "a@x.io")
print(is_err(r), r.error, db.error_kind(r))
print(db.exec("drop table nope") ?? "failed")
print(db.exec("insert into users values (?)", null))
```

```output
true db: UNIQUE constraint failed: users.email unique
failed
err("db: NOT NULL constraint failed: users.email")
```

```quillo error
print(db.exec(42))
```

```output
line 1: `db.exec` expects SQL text as its first argument, got int
```

### Chaining

The SQL comes first in a pipeline, the values in the call; `?` after the call passes a
failure on from a function:

```quillo
db.open("app.db")
db.exec("create table t (n integer check (n > 0))")
fn add(n: int) = db.exec("insert into t values (?)", n)?
print("insert into t values (?)" | db.exec(3))
print(add(4), add(-1))
print(db.query("select n from t") | map((r) => r.n))
```

```output
{ changes: 1, last_id: 1 }
{ changes: 1, last_id: 2 } err("db: CHECK constraint failed: n > 0")
[3, 4]
```

### See also

[db.query](/docs/reference/db.query/), [db.one](/docs/reference/db.one/), [db.transaction](/docs/reference/db.transaction/), [db.error_kind](/docs/reference/db.error_kind/), [db.open](/docs/reference/db.open/)
