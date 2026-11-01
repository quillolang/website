# error
error(any) -> any
group: Records and errors

### What it does

What an error value says, and null for any other value, so it can be asked of anything:
a value that did not fail has no error, whatever it is. `r.error` and `r.message` give the
same. On a server, what it gives is plain text: an error Quillo made is hidden from visitors
until it is read this way, so do not send it on.

### Examples

```quillo
print(error(err("not found")))
print(error(int("x")))
print(error(5))
```

```output
not found
not an int: "x"
null
```
