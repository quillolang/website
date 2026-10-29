# db.error_kind
db.error_kind(any) -> str | null
group: Database

### What it does

What kind of failure a database's error value is, in one word that is the same for
SQLite, PostgreSQL and MySQL, whose own messages differ: `"unique"` (a key or unique
column has the value already), `"foreign_key"`, `"not_null"`, `"check"`, or
`"conflict"` (another transaction: the database busy, a deadlock, a serialization
failure). Any other failure, and anything that is not a database error, is `null`. It
needs no effect, so it can be called from any function.

### Examples

```quillo
db.open("app.db")
db.exec("create table seats (show text, seat text, unique (show, seat))")
db.exec("insert into seats values ('tonight', 'A1')")
let r = db.exec("insert into seats values (?, ?)", "tonight", "A1")
print(db.error_kind(r))
if db.error_kind(r) == "unique" { print("Someone has just taken that seat") }
```

```output
unique
Someone has just taken that seat
```

### Edge cases

- A successful result is `null`, so a check reads as `db.error_kind(r) == "unique"`.
- An error value from somewhere else (`err("unique")`, a failed `read_file`), a string,
  a number or `null` is `null`.
- A failure the list does not cover (a missing table, bad syntax) is `null`, though
  the value is still an error: check `is_err` for that.

```quillo
db.open("app.db")
db.exec("create table teams (id integer primary key)")
db.exec("create table users (id integer primary key, email text unique not null, age integer check (age >= 0), team integer references teams(id))")
print(db.error_kind(db.exec("insert into users (email) values ('a@x.io')")))
print(db.error_kind(db.exec("insert into users (email) values ('a@x.io')")))
print(db.error_kind(db.exec("insert into users (email) values (null)")))
print(db.error_kind(db.exec("insert into users (email, age) values ('b@x.io', -1)")))
print(db.error_kind(db.exec("insert into users (email, team) values ('c@x.io', 9)")))
let other = db.exec("insert into nope values (1)")
print(db.error_kind(other), is_err(other))
print(db.error_kind(err("unique")), db.error_kind("unique"), db.error_kind(null), db.error_kind(read_file("nope")))
```

```output
null
unique
not_null
check
foreign_key
null true
null null null null
```

### Errors

`db.error_kind` never fails: whatever it is given, the answer is a word or `null`. The
usual shape is to name the failures the user can mend and pass the rest on with `?`:

```quillo
db.open("app.db")
db.exec("create table users (email text unique)")
db.exec("insert into users values ('a@x.io')")
fn signup(email: str) {
    let r = db.exec("insert into users values (?)", email)
    if db.error_kind(r) == "unique" { return err("that email is taken") }
    r?
    "welcome"
}
print(signup("b@x.io"), signup("a@x.io"))
```

```output
welcome err("that email is taken")
```

### Chaining

```quillo
db.open("app.db")
db.exec("create table t (n integer unique)")
print([1, 1, 2] | map((n) => db.exec("insert into t values (?)", n)) | map(db.error_kind))
print(db.exec("insert into t values (2)") | db.error_kind)
```

```output
[null, "unique", null]
unique
```

### See also

[db.exec](/docs/reference/db.exec/), [db.transaction](/docs/reference/db.transaction/), [is_err](/docs/reference/is_err/), [err](/docs/reference/err/)
