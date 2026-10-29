# slice
slice(list | str, int, int=) -> list | str
group: Strings

### What it does

The part of a list or a string from a start position up to, but not including, an end
position; without an end, up to the end. Positions count from 0; a negative position
counts from the end. A string is sliced by characters, and the result is of the same
kind as the input: a list gives a list, a string a string.

### Examples

```quillo
print(slice("hello", 1, 3), slice("hello", 2), slice("hello", -3))
print(slice([1, 2, 3, 4], 1, 3), slice([1, 2, 3, 4], -2))
```

```output
el llo llo
[2, 3] [3, 4]
```

### Edge cases

- Positions are kept within the value: a start or end past the end is the end, and one
  before the start is 0, so a slice never fails for being out of range.
- An end before the start gives an empty list or string.
- `-1` as the end leaves out the last item; `0, 0` is empty.
- Characters, not bytes: `slice("héllo😀", 1, 2)` is `é`, and `-1` is the emoji.

```quillo
print(slice("hello", 0, 100), slice("hello", 10), slice("", 0, 2), slice("abc", -10, 2))
print(slice("hello", 3, 1), slice([1, 2, 3, 4], 0, 0))
print(slice("hello", -3, -1), slice([1, 2, 3], 1, -1))
print(slice("héllo😀", 1, 2), slice("héllo😀", -1))
```

```output
hello   ab
 []
ll [2]
é 😀
```

### Errors

A first argument that is not a list or a string (`null` included), or a position that
is not an int, is a runtime error, not an error value. The start is required.

```quillo error
print(slice(null, 1))
```

```output
line 1: `slice` expects a list or str, got null
```

```quillo error
print(slice("abc", "1"))
```

```output
line 1: `slice` expects an int as argument 2, got str
```

### Chaining

In a pipeline the list or text comes first and the positions follow:

```quillo
print("hello" | slice(1, 3), [1, 2, 3] | slice(1))
let i = index_of("key=value", "=")
print(slice("key=value", 0, i), slice("key=value", i + 1))
print(range(10) | slice(-3) | map((n) => n * 2))
```

```output
el [2, 3]
key value
[14, 16, 18]
```

### See also

[take](/docs/reference/take/), [drop](/docs/reference/drop/), [index_of](/docs/reference/index_of/), [len](/docs/reference/len/), [split](/docs/reference/split/), [first](/docs/reference/first/), [last](/docs/reference/last/)
