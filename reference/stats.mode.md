# stats.mode
stats.mode(list) -> any
group: Statistics

### What it does

The most common value in a list, as Python's `statistics.mode`. The values can be
anything, text and booleans too, not only numbers. When several values are equally
common, the one seen first wins; [stats.multimode](/docs/reference/stats.multimode/)
gives all of them.

### Examples

```quillo
print(stats.mode([1, 2, 2, 3, 3, 3]))
print(stats.mode(["red", "blue", "red"]))
print(stats.mode([3, 1, 2]))
```

```output
3
red
3
```

### Edge cases

- A tie goes to the value that appears first: `[1, 1, 2, 2]` gives `1`, `[2, 2, 1, 1]`
  gives `2`.
- No value repeated means every value is a mode, so the first one is the answer.
- `1` and `1.0` count as the same value; the one seen first is given back.
- Text `"1"` is not the number `1`.
- `null`, lists and maps count too.

```quillo
print(stats.mode([1, 1, 2, 2]), stats.mode([2, 2, 1, 1]))
print(stats.mode([1.0, 1, 2]), stats.mode([1, "1", "1"]))
print(stats.mode([null, null, 1]), stats.mode([{ a: 1 }, { a: 1 }, { a: 2 }]))
```

```output
1 2
1.0 1
null { a: 1 }
```

### Errors

The mode of no data is a runtime error, not an error value: an empty list or `null`
stops the request. An argument that is not a list is a runtime error too.

```quillo error
print(stats.mode([]))
```

```output
line 1: `stats.mode`: no mode for empty data
```

```quillo error
print(stats.mode(5))
```

```output
line 1: `stats.mode` expects a list as argument 1, got int
```

### Chaining

```quillo
let votes = ["yes", "no", "yes", "abstain"]
print(votes | stats.mode)
print(([3, 3, 4] | stats.mode) + 1)
```

```output
yes
4
```

### See also

[stats.multimode](/docs/reference/stats.multimode/), [stats.median](/docs/reference/stats.median/), [count](/docs/reference/count/), [group_by](/docs/reference/group_by/)
