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
- `random()` takes no arguments; one given is ignored.

```quillo
print(type_of(floor(random() * 10)), int(random() * 10) >= 0)
print(range(5) | map((i) => random()) | unique | len)
print(random(1) < 1.0)
```

```output
int true
5
true
```

### Errors

`random` never fails and never gives an error value.

```quillo
print(is_err(random()))
```

```output
false
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
