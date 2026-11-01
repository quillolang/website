# exit
exit(int=) -> null
group: Files and processes

### What it does

Ends a script at once with the status `n`, from 0 to 255, or 0 if it is left out, once
what it printed is out: the status a shell's `$?`, a `make` rule or CI reads. A script
that ends by itself ends with 0, and one that fails with 1.

### Examples

```quillo noexec
// quillo run check.qwe -- data.json
let r = json.parse(read_file(args()[0]))
if is_err(r) {
    print(`not JSON: ${r.error}`)
    exit(2)
}
print("ok")
```

### Edge cases

- It ends the process from anywhere, a function or a loop: what follows does not run.
- What was written with `write_file` is written; a transaction not committed is not.

### Errors

A status outside 0 to 255, or not an int, is a runtime error; and so is `exit` in a
program that serves, as a request is not the one to stop the server.

```quillo error
exit(256)
```

```output
line 1: `exit` takes a status from 0 to 255, got 256
```

### Chaining

None.

### See also

[stdin](/docs/reference/stdin/), [read_line](/docs/reference/read_line/), [args](/docs/reference/args/)
