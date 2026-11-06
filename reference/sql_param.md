# sql_param
sql_param(str | list) -> str
group: Database

### What it does

A named SQL parameter, `:title`, checked: the name is letters, digits and `_` (of any
script, as [sql_name](/docs/reference/sql_name/) takes them), not starting with a digit
and at most 63 bytes long. A list of names gives them
separated by commas, `:title, :body`, for an `insert ... values (...)` whose values
come from a map. `quillo check` does not warn about SQL built with it.

### Examples

```quillo
print(sql_param("title"))
print(sql_param(["title", "body"]))
let cols = ["title", "body"]                       // the program's list, not the visitor's
print(`insert into posts (${sql_name(cols)}) values (${sql_param(cols)})`)
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
- Take the columns from the program, never from what the visitor sent:
  `keys(request.form)` names `is_admin` and `id` as well as `email`, and they are names,
  so `sql_name` and `sql_param` take them. A sign-up form with `is_admin=1` made an
  admin. A record type, `{ form: Signup }`, keeps its fields only.

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
digit, one over 63 bytes, or a value that is not a string (or a list of strings)
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
let set = cols | map((c) => `${sql_name(c)} = ${sql_param(c)}`) | join(", ")
print(`update posts set ${set} where id = :id`)
```

```output
update posts set "title" = :title, "body" = :body where id = :id
```

An update takes the pairs, which every database takes; a column list, `set (a, b) =
(...)`, is not MySQL's, nor PostgreSQL's for one column. `quillo check` follows `map`
and `join` over `sql_name` and `sql_param`, through every value the function can give,
so the `db.exec` below gets no warning; a raw `${c}` in that function still does. It
trusts only the builtins: a function or a parameter of the program's own named
`sql_name`, `map` or `join` is not taken for them.

```quillo noexec
let row = { title: "Hello", body: "...", id: 7 }
db.exec(`update posts set ${set} where id = :id`, row)
```

### See also

[sql_name](/docs/reference/sql_name/), [sql](/docs/reference/sql/), [keys](/docs/reference/keys/), [db.exec](/docs/reference/db.exec/)
