# db.shards
db.shards(list) -> map | error(str)
group: Database

### What it does

Data split over several databases by a key (a customer, an account). The list names
the shards, paths or URLs of any kind, mixed if need be, and the result is a map:
`.on(key)` is the connection for a key, with `exec`, `query`, `one` and `transaction`
of its own; `.all(sql, values...)` asks every shard and gives their rows together;
`.migrate(folder)` runs the folder on each; `.count` is how many there are. Keys are
spread by jump consistent hashing of their text, the same on every server, so a shard
added at the end takes its share of keys from the others and moves no other key.

### Examples

```quillo
let users = db.shards(["shard1.db", "shard2.db", "shard3.db"])
print(users.count)
write_file("migrations/001_users.sql", "create table users (id integer primary key, name text)")
print(users.migrate())
for id in [1, 2, 3, 4, 5, 6] {
    users.on(id).exec("insert into users (id, name) values (?, ?)", id, `user ${id}`)
}
print(users.on(3).one("select * from users where id = ?", 3))
print(users.all("select count(*) as n from users"))
print(users.all("select name from users where id > ?", 4))
```

```output
3
[["001_users.sql"], ["001_users.sql"], ["001_users.sql"]]
{ id: 3, name: "user 3" }
[{ n: 1 }, { n: 1 }, { n: 4 }]
[{ name: "user 5" }, { name: "user 6" }]
```

### Edge cases

- `1` and `"1"` are one key: the hash is of the key's text. The same key gives the same
  shard every time, and `.on(k)` for one key compares equal to itself.
- `.all` gives one list with every shard's rows, an aggregate once per shard: add them
  up in the program. It asks the shards one after another and stops at the first that
  fails, an error value naming the shard.
- `query`, `one`, `exec` and `transaction` on the shards map itself are error values:
  pick a shard with `.on`, or ask them all.
- A shard that cannot be opened makes the whole call an error value.

```quillo
let u = db.shards(["s1.db", "s2.db"])
for k in ["a", "b"] { u.on(k).exec("create table if not exists t (k text)") }
print(u.on(1) == u.on("1"), u.on("a") == u.on("a"))
print(["a", "b", "c", "d", "e", "f"] | map((k) => u.on(k) == u.on("a")))
print(u.all("select 1 as one"))
print(u.on("a").exec("drop table t"), u.all("select count(*) as n from t"))
print(u.query("select 1"))
print(db.shards(["s1.db", "nope/dir/s2.db"]) | is_err)
```

```output
true true
[true, false, false, false, true, false]
[{ one: 1 }, { one: 1 }]
{ changes: 0, last_id: 0 } err("db: shard 2: no such table: t")
err("db: these are shards: `.on(key)` is the one for a key, `.all(sql)` asks every one")
true
```

### Errors

An empty list, an argument that is not a list, or `.on()` without a key are runtime
errors. SQL failures on a shard are error values, as with `db`.

```quillo error
print(db.shards("shard1.db"))
```

```output
line 1: `db.shards` expects a list of paths or database URLs, one per shard
```

### Chaining

```quillo
let u = db.shards(["s1.db", "s2.db"])
for k in ["a", "b"] { u.on(k).exec("create table if not exists t (k text)") }
print(["a", "b", "c"] | map((k) => u.on(k).exec("insert into t values (?)", k)) | map((r) => r.changes))
print("select count(*) as n from t" | u.all | map((r) => r.n) | sum)
```

```output
[1, 1, 1]
3
```

### See also

[db.connect](/docs/reference/db.connect/), [db.atomic](/docs/reference/db.atomic/), [db.migrate](/docs/reference/db.migrate/), [db.open](/docs/reference/db.open/)
