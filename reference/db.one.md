# db.one
db.one(str, any...) -> map | null | error(str)
group: Database

### What it does

Runs a query and gives its first row as a map, or `null` when there is none: a record
by id, a count, an `insert ... returning id`. Values go in through `?`, in order, or
`:name` from one map. On PostgreSQL the whole answer is fetched and one row kept, so
write `limit 1` there. A SQL failure is an error value whose text starts `db: `.

### Examples

```quillo
db.open("app.db")
db.exec("create table todos (id integer primary key, text text)")
db.exec("insert into todos (text) values ('milk'), ('eggs')")
print(db.one("select * from todos where id = ?", 2))
print(db.one("select * from todos where id = :id", { id: 1 }))
print(db.one("select * from todos where id = ?", 99))
print(db.one("select count(*) as n from todos").n)
print(db.one("insert into todos (text) values (?) returning id", "jam"))
```

```output
{ id: 2, text: "eggs" }
{ id: 1, text: "milk" }
null
2
{ id: 3 }
```

### Edge cases

- No row is `null`, not an error, so `?? reply 404 ...` and `?? { }` work, and a field
  of the `null` is `null` rather than a failure.
- Of several rows the first is given, in the order the query says; `order by` makes
  that definite.
- A different number of values than `?` marks, or a `:name` the map lacks, is an error
  value.
- Several statements in one text: the first one's first row is given.

```quillo
db.open("app.db")
db.exec("create table t (id integer primary key, a text)")
db.exec("insert into t (a) values ('x'), ('y'), ('z')")
print(db.one("select * from t where id = 9"), db.one("select * from t where id = 9").a)
print(db.one("select * from t where id = 9") ?? { a: "none" })
print(db.one("select a from t order by id desc"))
print(db.one("select * from t where id = ?", 1, 2))
print(db.one("select 1 as x; select 2 as y"))
```

```output
null null
{ a: "none" }
{ a: "z" }
err("db: the query has 1 parameter, got 2")
{ x: 1 }
```

### Errors

A query the database refuses is an error value; `?` passes it on. SQL that is not a
string is a runtime error.

```quillo
db.open("app.db")
let r = db.one("select * from nope")
print(is_err(r), r.error)
print(db.one("select * from nope") ?? null)
```

```output
true db: no such table: nope
null
```

```quillo error
print(db.one(1))
```

```output
line 1: `db.one` expects SQL text as its first argument, got int
```

### Chaining

The SQL comes first in a pipeline, the values in the call:

```quillo
db.open("app.db")
db.exec("create table todos (id integer primary key, text text)")
db.exec("insert into todos (text) values ('milk')")
print("select text from todos where id = ?" | db.one(1))
print(("select count(*) as n from todos" | db.one).n)
```

```output
{ text: "milk" }
1
```

```quillo noexec
route GET /todos/:id {
    let todo = db.one("select * from todos where id = ?", id) ?? reply 404 "No such todo"
    todo
}
```

### See also

[db.query](/docs/reference/db.query/), [db.exec](/docs/reference/db.exec/), [db.transaction](/docs/reference/db.transaction/), [db.error_kind](/docs/reference/db.error_kind/)
