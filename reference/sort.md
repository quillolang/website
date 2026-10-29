# sort
sort(list | null) -> list
group: Lists

### What it does

The items in ascending order, as a new list. Numbers (ints, floats and decimals
together) order as numbers and strings by code point. The sort is stable: items that
compare equal keep their order. There is no comparator and no descending flag; use
[sort_by](/docs/reference/sort_by/) for a key and [reverse](/docs/reference/reverse/)
for descending. `null` counts as an empty list.

### Examples

```quillo
print(sort([3, 1, 2]))
print(sort([2, 1.5, 1]))
print(sort(["pear", "apple", "fig"]))
print(reverse(sort([3, 1, 2])))
```

```output
[1, 2, 3]
[1, 1.5, 2]
["apple", "fig", "pear"]
[3, 2, 1]
```

### Edge cases

- An empty list or `null` gives `[]`. The list given is not changed.
- Strings order by code point, not alphabetically: every capital comes before every
  lower-case letter, letters outside ASCII after them, and `"10"` before `"9"`. Sort
  by `lower` for a case-blind order, and numbers as numbers, not as text.
- Stable: `sort([1, 1.0])` keeps `1` first and `sort([1.0, 1])` keeps `1.0` first.
- Duplicates stay; [unique](/docs/reference/unique/) removes them.
- Ints with decimals sort exactly; a float with a decimal does not compare (see Errors).

```quillo
print(sort([]), sort(null))
let xs = [3, 1, 2]
let s = sort(xs)
print(xs, s)
print(sort(["b", "B", "a", "A", "éa"]), sort(["10", "9", "100"]), sort([10, 9, 100]))
print(sort_by(["Bob", "alice", "Carl"], lower))
print(sort([1, 1.0]), sort([1.0, 1]), sort([3, 3, 1]))
print(sort([2, dec("1.75"), 1]))
```

```output
[] []
[3, 1, 2] [1, 2, 3]
["A", "B", "a", "b", "éa"] ["10", "100", "9"] [9, 10, 100]
["alice", "Bob", "Carl"]
[1, 1.0] [1.0, 1] [1, 3, 3]
[1, 1.75m, 2]
```

### Errors

An argument that is not a list or `null` is a runtime error, not an error value. Two
items that do not order are a runtime error too: a string with a number, `null`,
booleans, lists, maps, `NaN`, or a decimal with a float (convert one side first). A
list of one item is never compared, so `sort([null])` is `[null]`.

```quillo error
print(sort([1, "a"]))
```

```output
line 1: `sort` cannot compare str with int
```

```quillo error
print(sort([[2], [1]]))
```

```output
line 1: `sort` cannot compare list with list
```

```quillo error
print(sort([dec("1"), 1.5]))
```

```output
line 1: `sort` cannot compare float with dec: a dec is exact and a float is not, so convert one with dec(x) or float(x)
```

### Chaining

In a pipeline `sort` takes the list and needs no arguments: `xs | sort`. Reverse it
for descending, take from the front for the smallest few.

```quillo
print([3, 1, 2] | sort | reverse)
print([5, 3, 9, 1] | sort | take(2))
print(["b", "a", "b"] | unique | sort | join(", "))
```

```output
[3, 2, 1]
[1, 3]
a, b
```

### See also

[sort_by](/docs/reference/sort_by/), [reverse](/docs/reference/reverse/), [unique](/docs/reference/unique/), [min](/docs/reference/min/), [max](/docs/reference/max/), [vec.argsort](/docs/reference/vec.argsort/)
