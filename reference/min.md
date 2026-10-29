# min
min(list | null) -> any
group: Lists

### What it does

The smallest item of a list, or `null` when the list is empty. Numbers compare as
numbers (ints, floats and decimals together), strings by code point. It takes one list,
not several values: `min([a, b])`, not `min(a, b)`.

### Examples

```quillo
print(min([3, 1, 2]))
print(min([2.5, 1, dec("0.75")]))
print(min(["pear", "apple", "fig"]))
let people = [{ name: "Ann", age: 30 }, { name: "Bo", age: 25 }]
print(min(map(people, (p) => p.age)))
```

```output
1
0.75
apple
25
```

### Edge cases

- `min([])` and `min(null)` are `null`, not an error. Give a default with `??`.
- Strings compare by code point, so capitals come before lower case and `"10"` is
  less than `"9"`.
- Equal items: the first one wins, so `min([2, 2.0])` is `2` and `min([2.0, 2])` is
  `2.0`.
- A one-item list gives that item.
- A dec with an int compares exactly; a dec with a float does not compare at all (see
  Errors).

```quillo
print(min([]), min(null), min([]) ?? 0)
print(min(["b", "B", "a"]), min(["10", "9"]))
print(min([2, 2.0]), min([2.0, 2]))
print(min([5]), min([dec("1.0"), 1]))
```

```output
null null 0
B 10
2 2.0
5 1.0
```

### Errors

An argument that is not a list or `null` is a runtime error, not an error value. Two
items that do not order are a runtime error too: a string with a number, `null`,
booleans, lists, maps, `NaN`, or a decimal with a float (convert one side first).

```quillo error
print(min([1, "a"]))
```

```output
line 1: `min` cannot compare str with int
```

```quillo error
print(min([dec("1"), 1.5]))
```

```output
line 1: `min` cannot compare float with dec: a dec is exact and a float is not, so convert one with dec(x) or float(x)
```

```quillo error
print(min([1, float("nan")]))
```

```output
line 1: `min` cannot compare float with int
```

### Chaining

In a pipeline `min` takes the list and needs no arguments: `xs | map(f) | min`. For
the item with the smallest key rather than the key itself, sort by it and take the
first.

```quillo
let words = ["pear", "fig", "apple"]
print(words | map(len) | min)
print(words | sort_by(len) | first)
print([] | min ?? "nothing")
```

```output
3
fig
nothing
```

### See also

[max](/docs/reference/max/), [sort](/docs/reference/sort/), [sort_by](/docs/reference/sort_by/), [first](/docs/reference/first/), [sum](/docs/reference/sum/), [vec.argmin](/docs/reference/vec.argmin/)
