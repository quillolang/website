# sql_name
sql_name(str | list) -> str
group: Database

### What it does

A table's or a column's name, checked and quoted, for SQL that cannot take it as a
`?` parameter: `"title"`, or `` `title` `` when the program's database is MySQL. A
list of names gives them separated by commas. A name is letters, digits and `_`,
not starting with a digit and at most 64 characters long; anything else is refused,
so a name made from data (`` sql_name(`obj_${id}`) ``) cannot carry SQL into the
query, and `quillo check` does not warn about SQL built with it.

### Examples

```quillo
print(sql_name("title"))
print(sql_name(["title", "body"]))
let row = { title: "Hello", body: "..." }
print(`insert into posts (${sql_name(keys(row))}) values (${sql_param(keys(row))})`)
```

```output
"title"
"title", "body"
insert into posts ("title", "body") values (:title, :body)
```

### Edge cases

- Underscores and digits are fine inside a name, and a name may start with `_`.
- An empty list gives the empty string.
- Exactly 64 characters is the longest name taken.
- Only ASCII letters count: `é` is refused.
- The quotes are double quotes for SQLite and PostgreSQL; a program whose database
  is MySQL gets backticks, since MySQL reads `"x"` as text.

```quillo
print(sql_name("_x1"), sql_name("obj_42"))
print(len(sql_name([])))
let long = "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijkl"
print(len(long), len(sql_name(long)))
```

```output
"_x1" "obj_42"
0
64 66
```

### Errors

A name with anything but letters, digits and `_`, an empty one, one starting with a
digit, one over 64 characters, or a value that is not a string (or a list of strings)
is a runtime error, not an error value: the request stops instead of running the SQL.

```quillo error
print(sql_name("posts; drop table posts"))
```

```output
line 1: `sql_name`: "posts; drop table posts" is not a name SQL can take (letters, digits and _)
```

```quillo error
print(sql_name(["ok", "1abc"]))
```

```output
line 1: `sql_name`: "1abc" is not a name SQL can take (letters, digits and _)
```

```quillo error
print(sql_name(42))
```

```output
line 1: `sql_name` takes a name (a str) or a list of them, got int
```

### Chaining

```quillo
print(["id", "name"] | sql_name)
let cols = ["title", "body"]
print(`update posts set (${cols | sql_name}) = (${cols | sql_param}) where id = :id`)
```

```output
"id", "name"
update posts set ("title", "body") = (:title, :body) where id = :id
```

```quillo noexec
fn table_of(id: int) = sql_name(`obj_${id}`)
let rows = db.query(`select * from ${table_of(id)} order by id`)
```

### See also

[sql_param](/docs/reference/sql_param/), [sql](/docs/reference/sql/), [keys](/docs/reference/keys/), [db.query](/docs/reference/db.query/)
