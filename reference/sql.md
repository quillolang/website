# sql
sql(str) -> str
group: Database

### What it does

The text as it is. Written as a tag on a template, `` sql`...` ``, it tells editors to
highlight the text as SQL. It changes nothing about the query: values still go in as
`?` parameters, and `quillo check` still warns when a value is built into SQL with
`${...}` or `+` on its way to `db.query`, `db.one` or `db.exec`. Braces in the
template are plain text; `${...}` fills in values.

### Examples

```quillo
let q = sql`select * from posts where id = ?`
print(q)
print(sql("select 1"))
```

```output
select * from posts where id = ?
select 1
```

### Edge cases

- The result is a plain string, equal to the text written: nothing is parsed, quoted
  or escaped.
- A value filled in with `${...}` is part of the text, as in any template; a table's or
  a column's name goes in with [sql_name](/docs/reference/sql_name/), a named
  parameter with [sql_param](/docs/reference/sql_param/).
- An empty template gives the empty string.

```quillo
print(sql`select 1` == "select 1")
let table = sql_name("posts")
print(sql`select * from ${table} order by id`)
print(len(sql``))
```

```output
true
select * from "posts" order by id
0
```

### Errors

A value that is not a string is a runtime error, not an error value. The message
names `css`, the tag it shares its code with.

```quillo error
print(sql(42))
```

```output
line 1: `css` expects a str as argument 1, got int
```

### Chaining

The string goes to the database like any other; the tag reads well with the query in
a variable first.

```quillo noexec
let q = sql`select * from posts where author = ? order by created desc`
let posts = db.query(q, [author])
let one = sql`select * from posts where id = ?` | db.one([id])
```

### See also

[sql_name](/docs/reference/sql_name/), [sql_param](/docs/reference/sql_param/), [db.query](/docs/reference/db.query/), [css](/docs/reference/css/)
