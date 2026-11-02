# db.sql_name
db.sql_name(str | list) -> str
group: Database

### What it does

A table's or a column's name, checked and quoted for the database it is called on, for
SQL that cannot take it as a `?` parameter. On a connection from `db.connect`,
`shop.sql_name(col)` quotes as that database reads names; `db.sql_name(col)` quotes for
the program's database, as `sql_name` does. MySQL gets backticks (`` `title` ``), since it
reads `"title"` as text; SQLite and PostgreSQL get double quotes. A list of names gives
them separated by commas. The names it takes are those `sql_name` takes: letters, digits
and `_`, not starting with a digit, at most 64 characters. It asks the database nothing,
so it needs no effect, and `quillo check` does not warn about SQL built with it.

### Examples

```quillo
let shop = db.connect("shop.db")
shop.exec("create table items (id integer, title text)")
shop.exec("insert into items values (1, 'Lamp'), (2, 'Desk')")
let col = "title"
print(shop.sql_name(col), db.sql_name(col))
print(shop.query(`select ${shop.sql_name(col)} from items order by ${shop.sql_name("id")}`))
```

```output
"title" "title"
[{ title: "Lamp" }, { title: "Desk" }]
```

```quillo noexec
db.open("app.db")                                  // the program's: SQLite
let shop = db.connect(env("SHOP_URL"))             // mysql://...
let col = "title"
print(sql_name(col), shop.sql_name(col))           // "title" `title`
shop.query(`select ${shop.sql_name(col)} from items`)
```

### Edge cases

- Use the connection's own whenever the SQL goes to a connection: a bare `sql_name`
  quotes for the program's database, which may be another kind.
- A list gives the names separated by commas; an empty list gives the empty string.
- It needs no effect: a function declared `with http` may call it, though not the
  connection's `query`.

```quillo
let shop = db.connect("shop.db")
print(shop.sql_name(["id", "title"]))
print(len(shop.sql_name([])))
fn cols() with time = shop.sql_name(["a", "b"])
print(cols())
```

```output
"id", "title"
0
"a", "b"
```

### Errors

A name with anything but letters, digits and `_`, an empty one, one starting with a
digit, one over 64 characters, or a value that is not a string (or a list of strings)
is a runtime error, not an error value: the request stops instead of running the SQL.

```quillo error
let shop = db.connect("shop.db")
print(shop.sql_name("x; drop table items"))
```

```output
line 2: `sql_name`: "x; drop table items" is not a name SQL can take (letters, digits and _)
```

### Chaining

```quillo
let shop = db.connect("shop.db")
print(["id", "title"] | shop.sql_name)
print(["id"] | db.sql_name)
```

```output
"id", "title"
"id"
```

### See also

[sql_name](/docs/reference/sql_name/), [db.connect](/docs/reference/db.connect/), [sql_param](/docs/reference/sql_param/), [db.query](/docs/reference/db.query/)
