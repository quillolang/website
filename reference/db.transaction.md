# db.transaction
db.transaction(map | fn, fn=) -> any
group: Database

### What it does

Runs a function with all of its database changes kept together: when the function
fails, returns an error value or replies early, everything it did in the database is
rolled back; otherwise it is committed and the function's value is given. An options
map before the function sets `isolation` (`"serializable"`, `"repeatable_read"` or
`"read_committed"`) and `retries` (0 to 20), how many times to run the function again
when another transaction made the database give up on it (a deadlock, a serialization
failure, a busy SQLite file). One inside another is a savepoint.

### Examples

```quillo
db.open("app.db")
db.exec("create table accounts (id integer primary key, balance integer not null check (balance >= 0))")
db.exec("insert into accounts (balance) values (100), (20)")
print(db.transaction(() => {
    db.exec("update accounts set balance = balance - 30 where id = 1")?
    db.exec("update accounts set balance = balance + 30 where id = 2")?
    "moved"
}))
print(db.query("select * from accounts"))
let r = db.transaction(() => {
    db.exec("update accounts set balance = balance - 40 where id = 1")?
    db.exec("update accounts set balance = balance - 500 where id = 2")?
})
print(r)
print(db.query("select * from accounts"))
```

```output
moved
[{ id: 1, balance: 70 }, { id: 2, balance: 50 }]
err("db: CHECK constraint failed: balance >= 0")
[{ id: 1, balance: 70 }, { id: 2, balance: 50 }]
```

```quillo noexec
fn withdraw(account: int, cents: int) with db =
    db.transaction({ isolation: "serializable", retries: 5 }, () => {
        let balance = db.one("select balance from accounts where id = ?", account).balance
        if balance < cents { return err("not enough money") }
        db.exec("update accounts set balance = balance - ? where id = ?", cents, account)?
    })
```

### Edge cases

- The function's value is the transaction's: an error value (made with `err`, returned,
  or passed up with `?`) rolls back and is given back, so the caller sees why.
- A `db.exec` that fails in the middle of the function, its error value dropped, does
  not roll back by itself: the function goes on and commits. Put `?` after it, or
  return it. As the last expression its error value is the function's, and rolls back.
- Nested: an inner transaction that fails rolls back only its own part, and the outer
  one goes on. Giving the inner one an isolation is a runtime error: options belong to
  the outermost.
- On SQLite every transaction is serializable whatever is asked; with options it takes
  the write lock at once (`begin immediate`).
- A function that may run again (`retries`) should do nothing that cannot be taken
  back: no `http.*` calls inside it; global variables it changes are not rolled back.

```quillo
db.open("app.db")
db.exec("create table a (x integer)")
print(db.transaction(() => { db.exec("insert into a values (1)"); err("changed my mind") }))
print(db.query("select * from a"))
print(db.transaction(() => { db.exec("insert into a values (2)"); db.exec("drop table nope"); "went on" }))
print(db.query("select * from a"))
print(db.transaction(() => { db.exec("insert into a values (3)"); db.exec("drop table nope")? }))
print(db.query("select * from a"))
print(db.transaction(() => { db.exec("insert into a values (3)"); db.exec("drop table nope") }))
print(db.query("select * from a"))
print(db.transaction(() => { db.transaction(() => { db.exec("insert into a values (4)"); err("inner") }); "outer went on" }))
print(db.query("select * from a"))
print(db.transaction({ isolation: "serializable", retries: 3 }, () => db.one("select count(*) as n from a")))
print(db.transaction(() => null))
```

```output
err("changed my mind")
[]
went on
[{ x: 2 }]
err("db: no such table: nope")
[{ x: 2 }]
err("db: no such table: nope")
[{ x: 2 }]
outer went on
[{ x: 2 }]
{ n: 1 }
null
```

### Errors

A runtime error inside the function stops the request, after the rollback. Options
with an unknown isolation, `retries` outside 0 to 20, an isolation on a nested
transaction, or an argument that is not a function are runtime errors. Out of retries,
the transaction gives the database's error value.

```quillo error
db.open("app.db")
db.exec("create table a (x integer)")
print(db.transaction(() => db.transaction({ isolation: "serializable" }, () => 1)))
```

```output
line 3: a transaction inside another cannot change its isolation: give it to the outermost one
```

```quillo error
print(db.transaction({ retries: 50 }, () => 1))
```

```output
line 1: `db.transaction`'s retries is a number from 0 to 20, got 50
```

### Chaining

The transaction's value goes on like any other, so a function can be the transaction:

```quillo
db.open("app.db")
db.exec("create table t (id integer primary key, n integer)")
fn add(n: int) = db.transaction(() => db.one("insert into t (n) values (?) returning id", n))
print([1, 2, 3] | map(add) | map((r) => r.id))
print(db.transaction(() => db.query("select n from t")) | map((r) => r.n) | sum)
```

```output
[1, 2, 3]
6
```

### See also

[db.exec](/docs/reference/db.exec/), [db.one](/docs/reference/db.one/), [db.atomic](/docs/reference/db.atomic/), [db.error_kind](/docs/reference/db.error_kind/), [err](/docs/reference/err/)
