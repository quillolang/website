# db.exec_many
db.exec_many(str, list) -> map | error(str)
group: Database

### What it does

Runs one statement for each row of a list, all of them or none, and gives `{ changes }`:
how many rows they touched in all. Each row is a list of the statement's `?` values, in
order. It runs in a transaction of its own, or as a savepoint of the one it is in, so one
row that fails (a duplicate key, a broken constraint) leaves the database as it was and
gives that error value. On PostgreSQL and MySQL an `insert into t (...) values (?, ...)`
with nothing after its values goes as inserts of up to 1,000 rows each, as Python's
`executemany` sends them, so 20,000 rows are 20 round trips, not 20,000. Any other
statement runs a row at a time, still in the one call. For the id of a row inserted, use
[db.exec](/docs/reference/db.exec/).

### Examples

```quillo
db.open("app.db")
db.exec("create table products (sku text primary key, name text, price real)")
let imported = [{ sku: "a1", name: "Lamp", price: 12.5 }, { sku: "b2", name: "Desk", price: 80 }]
print(db.exec_many("insert into products (sku, name, price) values (?, ?, ?)", for p in imported => [p.sku, p.name, p.price]))
print(db.exec_many("update products set price = price * ? where sku = ?", [[0.9, "a1"], [0.5, "b2"]]))
print(db.query("select sku, price from products order by sku"))
```

```output
{ changes: 2 }
{ changes: 2 }
[{ sku: "a1", price: 11.25 }, { sku: "b2", price: 40.0 }]
```

### Edge cases

- An empty list changes nothing and gives `{ changes: 0 }`, without asking the database.
- Every row must have as many values as the first; one that does not is an error value,
  before anything runs.
- Rows are lists, not maps: `:name` values are for `db.exec`.
- An insert with something after its values (`on conflict ...`, `returning id`) runs a row
  at a time, so it behaves exactly as `db.exec` would for each row.

```quillo
db.open("app.db")
db.exec("create table t (n integer unique)")
print(db.exec_many("insert into t values (?)", []))
print(db.exec_many("insert into t values (?)", [[1], [2, 3]]))
print(db.exec_many("insert into t values (?)", [[1], [2], [1]]))
print(db.one("select count(*) as n from t").n)
```

```output
{ changes: 0 }
err("db: row 2 has 2 values, the first has 1")
err("db: UNIQUE constraint failed: t.n")
0
```

### Errors

The first row the database refuses is the error value, and no row is written. A row that
is not a list, or a second argument that is not a list of rows, stops the program.

```quillo
db.open("app.db")
db.exec("create table users (email text unique not null)")
let r = db.exec_many("insert into users values (?)", [["a@x.io"], ["b@x.io"], ["a@x.io"]])
print(is_err(r), db.error_kind(r), db.one("select count(*) as n from users").n)
```

```output
true unique 0
```

```quillo error
print(db.exec_many("insert into t values (?)", [1, 2]))
```

```output
line 1: `db.exec_many`: row 1 is int, not a list of the statement's values
```

### Chaining

The SQL comes first in a pipeline, the rows in the call:

```quillo
db.open("app.db")
db.exec("create table t (n integer)")
print("insert into t values (?)" | db.exec_many([[1], [2], [3]]))
```

```output
{ changes: 3 }
```
