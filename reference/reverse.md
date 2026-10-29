# reverse
reverse(list | str) -> list | str
group: Lists

### What it does

A list with its items in the opposite order, or a string with its characters in the
opposite order. The value given is left as it was.

### Examples

```quillo
print(reverse([1, 2, 3]))
print(reverse("hello"))
print(reverse(sort([3, 1, 2])))
```

```output
[3, 2, 1]
olleh
[3, 2, 1]
```

### Edge cases

- An empty list gives `[]` and the empty string gives `""`.
- A string is reversed by character, not by byte, so accented letters and emoji stay
  whole.
- Only a list or a string: unlike most list functions, `null` is not taken as an empty
  list (see Errors).
- The list given is not changed; `reverse` builds a new one.

```quillo
print(reverse([]), len(reverse("")))
print(reverse("añb"), reverse("🙂ab"))
let xs = [1, 2, 3]
let r = reverse(xs)
print(xs, r)
```

```output
[] 0
bña ba🙂
[1, 2, 3] [3, 2, 1]
```

### Errors

An argument that is not a list or a string is a runtime error, not an error value,
and that includes `null`. Give an empty list with `?? []` first when the value may be
null.

```quillo error
print(reverse(null))
```

```output
line 1: `reverse` expects a list or str, got null
```

```quillo error
print(reverse(42))
```

```output
line 1: `reverse` expects a list or str, got int
```

### Chaining

In a pipeline `reverse` takes the value and needs no arguments. It is how a sort is
made descending.

```quillo
print([3, 1, 2] | sort | reverse)
print("hello" | reverse | upper)
print(["a", "b", "c"] | reverse | join(""))
```

```output
[3, 2, 1]
OLLEH
cba
```

### See also

[sort](/docs/reference/sort/), [sort_by](/docs/reference/sort_by/), [first](/docs/reference/first/), [last](/docs/reference/last/), [slice](/docs/reference/slice/)
