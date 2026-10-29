# run_script
run_script(str, map | null=) -> any
group: Files and processes

### What it does

Runs Quillo code written by the program's users (a rule on a form's field, who may see a
record) on the server, in a sandbox, and gives its last expression's value, or an error
value saying what went wrong. The script sees the values in the map and the builtins
that only compute (`len`, `upper`, `map`, `filter`, `date.parse`, ...); it cannot read
files, the environment or the database, define functions, routes or state, `use` files,
or reply. It stops after 20,000 steps, and a value it makes may be up to 1 MB.

### Examples

```quillo
print(run_script("value > 3 ? null : `at least 4, got ${value}`", { value: 5 }))
print(run_script("value > 3 ? null : `at least 4, got ${value}`", { value: 1 }))
print(run_script("let total = items | map((i) => i.qty * i.price) | sum\ntotal > 100", { items: [{ qty: 2, price: 60 }] }))
print(run_script("name.upper", { name: "ann" }))
```

```output
null
at least 4, got 1
true
ANN
```

### Edge cases

- The map is optional; `null` means no values. An empty script gives `null`.
- Effects are out of reach: `env`, `read_file`, `db`, `now`, `random` are unknown names
  in a script, and `date` has no clock (`date.parse` works, `date.today` does not).
  A builtin passed in the map still cannot run (`env` needs the env effect).
- A function of the program passed in the map runs as the program's, with what the
  program may do: that is how a script asks for more.
- A runaway script is an error value, not a hang: too many steps, or a value over 1 MB.
- `return` ends the script with that value. A lambda `(x) => ...` is allowed; `fn` is not.

```quillo
print(run_script("1 + 2"), run_script("1 + 2", null), run_script(""))
print(run_script("env(\"HOME\")"), run_script("db.one(\"select 1\")"))
print(run_script("date.parse(d)", { d: "2026-10-29" }), run_script("now()"))
print(run_script("e(\"HOME\")", { e: env }))
print(run_script("taken(\"a.txt\")", { taken: (p) => !is_err(read_file(p)) }))
print(run_script("let i = 0\nwhile true { i = i + 1 }"))
print(run_script("let s = \"x\"\nwhile true { s = s + s }"))
print(run_script("return 5\n6"), run_script("f(2)", { f: (x) => x * 10 }))
print(run_script("fn f() = 1\nf()"))
print(run_script("route GET / = 1"), run_script("reply 400 \"no\""), run_script("<b>x</b>"))
```

```output
3 3 null
err("line 1: unknown name `env`") err("line 1: unknown name `db`")
2026-10-29 err("line 1: unknown name `now`")
err("line 1: `env` needs the env effect, which is not allowed here")
false
err("line 2: the script took too many steps")
err("line 2: the script made a value larger than 1 MB")
5 20
err("a script cannot define functions (use `(x) => ...`)")
err("a script cannot define routes") err("a script cannot reply") err("a script gives values, not markup")
```

### Errors

Whatever goes wrong in the script, a parse error, an unknown name, a bad argument,
division by zero, is an error value with the script's line, so the program can show
it to the user; `?? default` gives a value instead. The program's own mistakes are
runtime errors: a source that is not a string, or values that are not a map.

```quillo
let r = run_script("1 +")
print(is_err(r), r.error)
print(run_script("nope"), run_script("len(3)"), run_script("1 / 0"))
print(run_script("err(\"bad\")") | is_err)
print(run_script("nope") ?? false)
```

```output
true line 1: expected an expression, found end of input
err("line 1: unknown name `nope`") err("line 1: `len` expects a str, list or map, got int") err("line 1: division by zero")
true
false
```

```quillo error
print(run_script("1", 2))
```

```output
line 1: `run_script` expects a map as argument 2, got int
```

### Chaining

The source comes first in a pipeline, the values in the call:

```quillo
let rule = "age >= 18"
print(rule | run_script({ age: 20 }), rule | run_script({ age: 12 }))
print([{ age: 20 }, { age: 12 }] | filter((p) => run_script(rule, p)))
```

```output
true false
[{ age: 20 }]
```

### See also

[check_program](/docs/reference/check_program/), [is_err](/docs/reference/is_err/), [err](/docs/reference/err/), [read_upload](/docs/reference/read_upload/)
