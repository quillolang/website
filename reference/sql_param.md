# sql_param
sql_param(str | list) -> str
group: Database

### What it does

A named SQL parameter, `:title`, checked: the name is letters, digits and `_`, not
starting with a digit and at most 64 characters long. A list of names gives them
separated by commas, `:title, :body`, for an `insert ... values (...)` whose values
come from a map. `quillo check` does not warn about SQL built with it.

### Examples

```quillo
print(sql_param("title"))
print(sql_param(["title", "body"]))
let row = { title: "Hello", body: "..." }
print(`insert into posts (${sql_name(keys(row))}) values (${sql_param(keys(row))})`)
```

```output
:title
:title, :body
insert into posts ("title", "body") values (:title, :body)
```

### Edge cases

- The same name is accepted everywhere: what `sql_name` takes, `sql_param` takes.
- An empty list gives the empty string.
- A name is not checked against the map of values: a parameter the map does not
  hold is the database's error, when the query runs.
- Digits are fine inside a name, and a name may start with `_`.

```quillo
print(sql_param("_x1"), sql_param("A9"))
print(len(sql_param([])))
print(sql_param(keys({ b: 1, a: 2 })))
```

```output
:_x1 :A9
0
:b, :a
```

### Errors

A name with anything but letters, digits and `_`, an empty one, one starting with a
digit, one over 64 characters, or a value that is not a string (or a list of strings)
is a runtime error, not an error value.

```quillo error
print(sql_param("a-b"))
```

```output
line 1: `sql_param`: "a-b" is not a name SQL can take (letters, digits and _)
```

```quillo error
print(sql_param(null))
```

```output
line 1: `sql_param` takes a name (a str) or a list of them, got null
```

### Chaining

```quillo
let cols = ["title", "body"]
print(`update posts set (${cols | sql_name}) = (${cols | sql_param}) where id = :id`)
```

```output
update posts set ("title", "body") = (:title, :body) where id = :id
```

```quillo noexec
let row = { title: "Hello", body: "...", id: 7 }
db.exec(`update posts set (${sql_name(cols)}) = (${sql_param(cols)}) where id = :id`, row)
```

### See also

[sql_name](/docs/reference/sql_name/), [sql](/docs/reference/sql/), [keys](/docs/reference/keys/), [db.exec](/docs/reference/db.exec/)
