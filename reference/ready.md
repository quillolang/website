# ready
ready(str, fn) -> null
group: Requests and pages

### What it does

Adds a check of the program's own to `GET /_quillo/ready`, which answers 200 when
everything the program needs is there and 503 when not, with each part as JSON: its
database (`select 1`), each service it declares, and the checks added here. The
function is called for each probe and holds when it gives `true`. For an
orchestrator's readiness probe. It gives null.

### Examples

```quillo noexec
ready("ledger", () => len(accounts.problems() ?? ["down"]) == 0)
ready("uploads", () => len(read_file("uploads/.ok") ?? "") > 0)
```

```sh
curl -i localhost:8080/_quillo/ready
# {"ready": false, "checks": {"database": "ready", "ledger": "ready", "uploads": "not ready"}}
```

```quillo
print(ready("ledger", () => true))
```

```output
null
```

### Edge cases

- A check that gives anything but `true`, or fails, counts as not ready: a check
  written as `len(problems()) == 0` gives a boolean, which is what is wanted.
- Adding a check with the name of an earlier one replaces it.
- `/_quillo/health` is not affected: it says only whether the process is up. Neither
  request is logged or counted.
- Under a mount or `--base`, `/shop/_quillo/ready` asks the mounted program.
- In a plain program the function is never called: nothing probes it.

```quillo
print(ready("ledger", () => false), ready("ledger", () => true))
```

```output
null null
```

### Errors

A name that is not a string, or a second argument that is not a function, is a runtime
error, not an error value. Both are required.

```quillo error
ready("ledger")
```

```output
line 1: `ready` takes a name and a function that says whether it holds: ready("ledger", () => ...)
```

### Chaining

It stands at the top of the program, once per check. The function may be one of the
program's own by name:

```quillo
fn ledger_ok() = true
print(ready("ledger", ledger_ok))
```

```output
null
```

### See also

[schedule](/docs/reference/schedule/), [db.query](/docs/reference/db.query/), [allow_cross_site](/docs/reference/allow_cross_site/)
