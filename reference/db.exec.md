# db.exec
db.exec(str, any...) -> map | error(str)
group: Database

### What it does

Runs a statement that changes the database (`insert`, `update`, `delete`, `create
table`) and gives `{ changes, last_id }`: how many rows it touched, and the id of the
last row inserted on the connection (`null` on PostgreSQL, where `insert ... returning
id` with [db.one](/docs/reference/db.one/) does that). Values go in through `?`, in
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
{ changes: 0, last_id: 0 }
{ changes: 1, last_id: 1 }
{ changes: 1, last_id: 2 }
{ changes: 1, last_id: 2 }
{ changes: 1, last_id: 2 }
[{ id: 2, text: "eggs", done: false }]
```

### Edge cases

- `changes` is 0 when nothing matched; `last_id` is then still the last insert's (after
  an `update`, an old one).
- With values, one statement runs: on SQLite what follows the first `;` is ignored, on
  PostgreSQL it is an error. Without values the whole text runs statement by statement
  (a seed file: `db.exec(read_file("seed.sql"))`), and `changes` is the last one's.
- A different number of values than `?` marks is an error value; so is a `:name` the
  map does not have. Extra keys in the map are ignored.
- On SQLite, `insert ... returning` with values is an error value: use `db.one`.
- A list or a map as a value is stored as JSON text; `true` is stored as 1; a decimal
  and a float as their text or number, by the column's type.
- An empty statement is an error value.

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
```

```output
{ changes: 1, last_id: 1 } { changes: 0, last_id: 1 }
{ changes: 1, last_id: 2 }
{ changes: 1, last_id: 4 }
["x", "one", "two", "three"]
err("db: the query has 1 parameter, got 2")
err("db: no value for :a")
err("db: Execute returned results - did you mean to call query?")
{ changes: 1, last_id: 6 } { a: "[1,2]" }
{ changes: 1, last_id: 6 }
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
