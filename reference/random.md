# random
random() -> float
group: General

### What it does

A float from 0 up to, but not including, 1, different on each call. It is fast and
predictable, so it serves games, sampling and jitter, not secrets: a session id or a
token comes from [uuid](/docs/reference/uuid/) or [crypto.token](/docs/reference/crypto.token/).
There is no seed, so runs are not repeatable.

### Examples

```quillo
let r = random()
print(type_of(r), r >= 0.0, r < 1.0)
print(random() != random())
```

```output
float true true
true
```

### Edge cases

- The result is always a float, even when it happens to be whole; scale and truncate for
  an int, or use [random_int](/docs/reference/random_int/), which includes both ends.
- Two calls in one expression are two different numbers; a list made with `map` has a
  fresh one per item.
- `random()` takes no arguments; one given is a runtime error (below).

```quillo
print(type_of(floor(random() * 10)), int(random() * 10) >= 0)
print(range(5) | map((i) => random()) | unique | len)
```

```output
int true
5
```

### Errors

`random` never fails and never gives an error value. An argument is a runtime error,
and so is one for `quillo check` when the call is written out.

```quillo
print(is_err(random()))
```

```output
false
```

```quillo error
print(random(1))
```

```output
line 1: `random` takes 0 arguments, got 1: random()
```

### Chaining

`random` starts a pipeline rather than taking one, since it has no argument.

```quillo
print(random() * 100 | floor | type_of)
print(["a", "b", "c"] | map((x) => random()) | len)
```

```output
int
3
```

### See also

[random_int](/docs/reference/random_int/), [uuid](/docs/reference/uuid/), [crypto.token](/docs/reference/crypto.token/), [floor](/docs/reference/floor/)
