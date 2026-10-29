# db.query
db.query(str, any...) -> list | error(str)
group: Database

### What it does

Runs a query and gives every row as a list of maps, keyed by column name; no rows is
`[]`. Values go in through `?`, in order, or `:name` from one map, and never into the
SQL text. The whole answer is in memory (there is no cursor), so page large tables with
`limit`. A SQL failure is an error value whose text starts `db: `.

### Examples

```quillo
db.open("app.db")
db.exec("create table todos (id integer primary key, text text, done bool default false)")
db.exec("insert into todos (text) values ('milk'), ('eggs'), ('jam')")
db.exec("update todos set done = true where id = 2")
print(db.query("select * from todos where id > ?", 1))
print(db.query("select text from todos where done = :done", { done: false }))
print(db.query("select * from todos where id > ?", 10))
```

```output
[{ id: 2, text: "eggs", done: true }, { id: 3, text: "jam", done: false }]
[{ text: "milk" }, { text: "jam" }]
[]
```

### Edge cases

- SQL `NULL` is `null`; a column declared `bool` or `boolean` gives `true` and `false`,
  other 0s and 1s are ints; a `decimal(...)` column gives a decimal.
- Two columns of one name (`select a.id, b.id`) leave the last in the map: name them
  apart with `as`.
- A different number of values than `?` marks, or a `:name` the map lacks, is an error
  value; extra keys in the map are ignored.
- A list given for one `?` is one value, JSON text, not several: write one `?` per
  value for `in (?, ?)`.
- `where x = ?` with `null` matches nothing, as in SQL; write `is null`.

```quillo
db.open("app.db")
db.exec("create table t (id integer primary key, a text, flag bool, price decimal(10,2))")
db.exec("insert into t (a, flag, price) values ('x', 1, '12.50'), (null, 0, null)")
print(db.query("select * from t"))
print(db.query("select id, id as n from t where id = 1"))
print(db.query("select * from t where id = ?", 1, 2))
print(db.query("select * from t where id = :id", {}))
print(db.query("select * from t where id = :id", { id: 2, extra: true }))
print(db.query("select a from t where id in (?)", [1, 2]), db.query("select a from t where id in (?, ?)", 1, 2))
print(db.query("select id from t where a = ?", null), db.query("select id from t where a is null"))
```

```output
[{ id: 1, a: "x", flag: true, price: 12.5m }, { id: 2, a: null, flag: false, price: null }]
[{ id: 1, n: 1 }]
err("db: the query has 1 parameter, got 2")
err("db: no value for :id")
[{ id: 2, a: null, flag: false, price: null }]
[] [{ a: "x" }, { a: null }]
[] [{ id: 2 }]
```

### Errors

A query the database refuses (a missing table or column, bad syntax) is an error value;
`?` passes it on and `??` gives a default list. SQL that is not a string, or no SQL at
all, is a runtime error.

```quillo
db.open("app.db")
let r = db.query("select nope from todos")
print(is_err(r), r.error)
print(db.query("selec 1") ?? [])
```

```output
true db: no such table: todos
[]
```

```quillo error
print(db.query())
```

```output
line 1: `db.query` expects SQL text as its first argument, got nothing
```

### Chaining

The SQL comes first in a pipeline, so values are given in the call; the rows go on
into `map`, `filter` and friends:

```quillo
db.open("app.db")
db.exec("create table todos (id integer primary key, text text)")
db.exec("insert into todos (text) values ('milk'), ('eggs')")
print("select text from todos order by id" | db.query | map((r) => r.text))
print("select * from todos where id > ?" | db.query(1) | len)
print(db.query("select text from todos") | map((r) => upper(r.text)) | join(", "))
```

```output
["milk", "eggs"]
1
MILK, EGGS
```

### See also

[db.one](/docs/reference/db.one/), [db.exec](/docs/reference/db.exec/), [db.transaction](/docs/reference/db.transaction/), [join_on](/docs/reference/join_on/), [map](/docs/reference/map/)
