# db.atomic
db.atomic(list, fn) -> any
group: Database

### What it does

One transaction over several databases: runs the function and keeps all of its
changes in the listed databases, or none. The list names what takes part: `db`,
connections from `db.connect`, a shard (`users.on(id)`) or shards whole. It commits in
two phases, each PostgreSQL and MySQL part prepared first, the decision recorded in
Quillo's own tables, then committed; a part that cannot prepare, a function that
fails, returns an error value or replies early, rolls every part back. The function's
value is given back.

### Examples

```quillo noexec
db.atomic([db, ledger], () => {
    db.exec("update accounts set balance = balance - ? where id = ?", n, from)
    ledger.exec("insert into entries (account, amount) values (?, ?)", from, -n)
})
```

With one database it behaves as `db.transaction`, which is simpler to read:

```quillo
db.open("app.db")
db.exec("create table accounts (id integer primary key, balance integer)")
db.exec("insert into accounts (balance) values (100)")
print(db.atomic([db], () => {
    db.exec("update accounts set balance = balance - 10 where id = 1")?
    "done"
}))
print(db.one("select balance from accounts"))
print(db.atomic([db], () => {
    db.exec("update accounts set balance = 0 where id = 1")?
    err("changed my mind")
}))
print(db.one("select balance from accounts"))
```

```output
done
{ balance: 90 }
err("changed my mind")
{ balance: 90 }
```

### Edge cases

- A database the function uses that is not in the list is not part of it: its writes
  stay when the rest rolls back.
- At most one SQLite database may take part (it commits last, since SQLite cannot
  prepare a transaction): naming two is a runtime error.
- PostgreSQL needs `max_prepared_transactions` above 0 (it is 0 by default).
- A server that stops part way leaves prepared parts; recovery finishes them a minute
  or so later, from any server of the program.
- `db.transaction` nests inside it as usual; `db.atomic` cannot begin inside a
  transaction already open on one of its databases.

```quillo
db.open("app.db")
db.exec("create table a (x integer)")
print(db.atomic([db], () => { db.exec("insert into a values (1)")?; db.exec("drop table nope")? }))
print(db.query("select * from a"))
print(db.atomic([db], () => db.transaction(() => db.exec("insert into a values (2)"))))
print(db.query("select * from a"))
print(db.atomic([], () => "nothing to keep"))
```

```output
err("db: no such table: nope")
[]
{ changes: 1, last_id: 1 }
[{ x: 2 }]
nothing to keep
```

### Errors

An error value from the function rolls back and is given back. A list that is not a
list, a value in it that is not a database, two SQLite databases, a missing function,
or a call inside an open transaction are runtime errors.

```quillo error
db.open("app.db")
let ledger = db.connect("ledger.db")
print(db.atomic([db, ledger], () => 1))
```

```output
line 3: `db.atomic`: one SQLite database at most (it commits last; SQLite cannot prepare a transaction)
```

```quillo error
db.open("app.db")
print(db.transaction(() => db.atomic([db], () => 1)))
```

```output
line 2: `db.atomic` cannot begin inside a transaction already open on one of its databases
  in a function, called at main.qwe:2
```

### Chaining

The value comes out as the function gave it:

```quillo
db.open("app.db")
db.exec("create table t (n integer)")
print(db.atomic([db], () => { db.exec("insert into t values (3), (4)")?; db.query("select n from t") }) | map((r) => r.n) | sum)
```

```output
7
```

### See also

[db.transaction](/docs/reference/db.transaction/), [db.connect](/docs/reference/db.connect/), [db.shards](/docs/reference/db.shards/), [db.system](/docs/reference/db.system/)
