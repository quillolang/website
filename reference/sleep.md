# sleep
sleep(num) -> null
group: Dates

### What it does

Waits that many milliseconds, then gives `null`. Other requests run meanwhile: the wait
does not hold the server. There is no maximum. In a scheduled job or a tick the wait
ends early when the server stops or the program is loaded again, so a loop that runs
for ever stops; a request waits its sleep out. It is an effect, like `random()` and
`read_file`.

### Examples

```quillo
let before = now()
let r = sleep(5)
print(r, now() - before >= 5)
```

```output
null true
```

### Edge cases

- Zero is fine and returns at once; a float is allowed, cut to whole milliseconds.
- It returns `null`, so it ends an expression-bodied function with `null`; put it before
  the value you mean.
- In a job or a tick a server stopping or a reload ends the job there with a 503, as a
  `reply` would, instead of letting it run on old code.

```quillo
print(sleep(0), sleep(1.5))
fn wait_then(v) {
    sleep(1)
    v
}
print(wait_then("done"))
```

```output
null null
done
```

### Errors

A negative number, or anything that is not a number, is a runtime error, not an error
value.

```quillo error
print(sleep(-1))
```

```output
line 1: `sleep` expects milliseconds (a number >= 0), got int
```

```quillo error
print(sleep("5"))
```

```output
line 1: `sleep` expects milliseconds (a number >= 0), got str
```

### Chaining

It is rarely piped; in a loop it paces work, and in a tick it is what makes the tick
slow:

```quillo
let t = now()
for i in range(0, 3) { sleep(2) }
print(now() - t >= 6)
```

```output
true
```

```quillo noexec
schedule("every 1m", () => {
    for job in pending() {
        run(job)
        sleep(200)
    }
})
```

### See also

[now](/docs/reference/now/), [schedule](/docs/reference/schedule/), [every](/docs/reference/every/), [parallel](/docs/reference/parallel/)
