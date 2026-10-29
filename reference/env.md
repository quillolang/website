# env
env(str, any=) -> any
group: General

### What it does

The value of an environment variable, as a string, or `null` when it is not set; with a
second argument, that default instead of `null`. The `.env` beside the program is read
into the environment when the program starts, and a variable the environment already
has wins over the file. A component cannot call `env`, except for a variable named
`PUBLIC_...`, whose value is written into the browser's bundle as it was when the
program loaded.

### Examples

```quillo
print(env("HOME") != null, type_of(env("HOME")))
print(env("MISSING_QUILLO_VAR"), env("MISSING_QUILLO_VAR", "fallback"))
```

```output
true str
null fallback
```

### Edge cases

- The value is always a string: a port or a count is converted with `int`, and `??`
  gives the default when the variable is missing.
- The default can be any value, not only a string: `env("X", 42)` is `42` when `X` is
  not set.
- A variable that is set to the empty string is `""`, not `null`, so its default is not
  used.

```quillo
let port = int(env("PORT") ?? "3000")
print(port, type_of(port))
print(env("MISSING_QUILLO_VAR", 42))
print(len(env("PATH") ?? "") > 0)
```

```output
3000 int
42
true
```

```quillo noexec
let KEY = env("STRIPE_KEY")               // on the server: fine at the top level
component Map() {
    let token = env("PUBLIC_MAP_TOKEN")   // in a component: only a PUBLIC_ name
    <div data-token={token}></div>
}
```

### Errors

A name that is not a string is a runtime error, not an error value. A missing variable
is never an error: it is `null` or the default. Using `env` in a component, or a
top-level value made from it, is refused when the program loads.

```quillo error
print(env(42))
```

```output
line 1: `env` expects a str as argument 1, got int
```

### Chaining

```quillo
print(env("HOME") | contains("/"))
print(env("MISSING_QUILLO_VAR") ?? "none" | upper)
let [host, port] = split(env("LISTEN") ?? "0.0.0.0:3000", ":")
print(host, int(port))
```

```output
true
NONE
0.0.0.0 3000
```

### See also

[int](/docs/reference/int/), [str](/docs/reference/str/), [db.open](/docs/reference/db.open/), [read_file](/docs/reference/read_file/)
