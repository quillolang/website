# db.migrate
db.migrate(str=) -> list | error(str)
group: Database

### What it does

Brings the database's schema up to date from a folder of SQL files, applied in name
order (`001_todos.sql`, `002_tags.sql`, ...), and gives the names of the files it
applied this time. Each file runs once, in its own transaction, and is recorded in a
table `_quillo_migrations` with its SHA-256; a file already recorded is skipped. The
folder is `migrations` unless another is given. Call it right after `db.open`; for a
database per tenant it runs for each tenant's database when that is made.

### Examples

```quillo
db.open("app.db")
write_file("migrations/001_todos.sql", "create table todos (id integer primary key, text text not null);")
write_file("migrations/002_tags.sql", "create table tags (id integer primary key, name text);\ncreate table todo_tags (todo integer, tag integer);")
print(db.migrate())
print(db.migrate())
print(db.query("select name from sqlite_master where type = 'table' order by name") | map((r) => r.name))
write_file("migrations/003_done.sql", "alter table todos add column done bool default false")
print(db.migrate("migrations"))
print(db.query("select name from _quillo_migrations order by name") | map((r) => r.name))
```

```output
["001_todos.sql", "002_tags.sql"]
[]
["_quillo_migrations", "tags", "todo_tags", "todos"]
["003_done.sql"]
["001_todos.sql", "002_tags.sql", "003_done.sql"]
```

### Edge cases

- Nothing new to apply gives `[]`.
- Only files ending `.sql` directly in the folder count: other files and subfolders are
  ignored.
- Files sort by name as text, so `10_x.sql` comes before `2_x.sql`: pad the numbers.
- The name is the key: a renamed file runs again. A recorded file whose text changed
  later is not run again; a warning is printed on the server's log instead.
- A file may hold several statements, and no `begin` or `commit` of its own.

```quillo
db.open("app.db")
write_file("migrations/001_a.sql", "create table a (x)")
write_file("migrations/002_b.sql", "create table b (x)")
print(db.migrate())
write_file("migrations/002_b.sql", "create table b (x, y)")
print(db.migrate())
write_file("migrations/10_c.sql", "create table c (x)")
write_file("migrations/2_d.sql", "create table d (x)")
write_file("migrations/003_two.sql", "create table e (x);\ncreate table f (x);")
write_file("migrations/notes.txt", "create table g (x);")
write_file("migrations/sub/004_h.sql", "create table h (x);")
print(db.migrate())
print(db.query("select name from sqlite_master where type = 'table' order by name") | map((r) => r.name))
```

```output
["001_a.sql", "002_b.sql"]
[]
["003_two.sql", "10_c.sql", "2_d.sql"]
["_quillo_migrations", "a", "b", "c", "d", "e", "f"]
```

### Errors

A file that fails is rolled back and is a runtime error naming the file and the
database's message: the program does not start with a half-applied schema. A folder
that does not exist is a runtime error too, as is a folder name that is not a string.
On MySQL a statement that changes the schema commits at once, so a failing file keeps
what it did before: put one change in each file there.

```quillo error
db.open("app.db")
write_file("migrations/001_ok.sql", "create table t (a)")
write_file("migrations/002_bad.sql", "create table t (a)")
print(db.migrate())
```

```output
line 4: db.migrate: migration 002_bad.sql failed: table t already exists in create table t (a) at offset 13
```

### Chaining

A connection from `db.connect` and shards from `db.shards` have a `migrate` of their
own, with their own folder and record:

```quillo
db.open("app.db")
write_file("migrations/analytics/001_sales.sql", "create table sales (day text, total integer)")
let analytics = db.connect("analytics.db")
print(analytics.migrate("migrations/analytics"))
print(analytics.query("select name from sqlite_master where type = 'table' order by name") | map((r) => r.name))
print(db.query("select name from sqlite_master where type = 'table'"))
```

```output
["001_sales.sql"]
["_quillo_migrations", "sales"]
[]
```

### See also

[db.open](/docs/reference/db.open/), [db.connect](/docs/reference/db.connect/), [db.shards](/docs/reference/db.shards/), [db.exec](/docs/reference/db.exec/), [db.tenants](/docs/reference/db.tenants/)
