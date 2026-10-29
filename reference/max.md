# max
max(list | null) -> any
group: Lists

### What it does

The largest item of a list, or `null` when the list is empty. Numbers compare as
numbers (ints, floats and decimals together), strings by code point. It takes one list,
not several values: `max([a, b])`, not `max(a, b)`.

### Examples

```quillo
print(max([3, 1, 2]))
print(max([1, dec("2.75"), 2]))
print(max(["pear", "apple", "fig"]))
let people = [{ name: "Ann", age: 30 }, { name: "Bo", age: 25 }]
print(max(map(people, (p) => p.age)))
```

```output
3
2.75
pear
30
```

### Edge cases

- `max([])` and `max(null)` are `null`, not an error. Give a default with `??`.
- Strings compare by code point, so a lower-case letter is larger than any capital
  and `"9"` is larger than `"10"`.
- Equal items: the first one wins, so `max([2, 2.0])` is `2` and `max([2.0, 2])` is
  `2.0`.
- A one-item list gives that item.
- A dec with an int compares exactly; a dec with a float does not compare at all (see
  Errors).

```quillo
print(max([]), max(null), max([]) ?? 0)
print(max(["b", "B", "a"]), max(["10", "9"]))
print(max([2, 2.0]), max([2.0, 2]))
print(max([5]), max([dec("1.0"), 1]))
```

```output
null null 0
b 9
2 2.0
5 1.0
```

### Errors

An argument that is not a list or `null` is a runtime error, not an error value. Two
items that do not order are a runtime error too: a string with a number, `null`,
booleans, lists, maps, `NaN`, or a decimal with a float (convert one side first).

```quillo error
print(max([null, 1]))
```

```output
line 1: `max` cannot compare int with null
```

```quillo error
print(max([true, false]))
```

```output
line 1: `max` cannot compare bool with bool
```

```quillo error
print(max([dec("1"), 1.5]))
```

```output
line 1: `max` cannot compare float with dec: a dec is exact and a float is not, so convert one with dec(x) or float(x)
```

### Chaining

In a pipeline `max` takes the list and needs no arguments: `xs | map(f) | max`. For
the item with the largest key rather than the key itself, sort by it and take the last.

```quillo
let words = ["pear", "fig", "apple"]
print(words | map(len) | max)
print(words | sort_by(len) | last)
print([] | max ?? 0)
```

```output
5
apple
0
```

### See also

[min](/docs/reference/min/), [sort](/docs/reference/sort/), [sort_by](/docs/reference/sort_by/), [last](/docs/reference/last/), [sum](/docs/reference/sum/), [vec.argmax](/docs/reference/vec.argmax/)
