# index_of
index_of(list | str, any) -> int | null
group: Strings

### What it does

The position of a value in a list or of a piece of text in a string, counting from 0,
or `null` when it is not there: `null`, not `-1`. In a list the first item equal to the
value (as `==` says) counts; in a string the piece is written as text and the first
occurrence counts, by characters.

### Examples

```quillo
print(index_of("hello", "l"), index_of("hello", "lo"), index_of("hello", "x"))
print(index_of([1, 2, 3, 2], 2), index_of([1, 2, 3], 4))
```

```output
2 3 null
1 null
```

### Edge cases

- Not found is `null`, so give it `?? -1` where a number is needed, or test for `null`.
- In a string, case matters, the search is by characters not bytes, and the empty piece
  is at 0; a number is searched as its text.
- In a list the match is equality: `1` is found in `[1.0, 2]`, `"2"` is not found in
  `[1, 2]`; `null`, a list or a map inside is found when it is equal.
- The empty string and the empty list hold nothing but `""`.

```quillo
print(index_of("hello", "L"), index_of("héllo", "l"), index_of("hello", ""), index_of("a1b", 1))
print(index_of([1.0, 2], 1), index_of([1, 2], "2"), index_of([null, 1], null), index_of([[1], [2]], [2]), index_of([{ a: 1 }], { a: 1 }))
print(index_of("", ""), index_of("", "a"), index_of([], 1))
print(index_of("hello", "x") ?? -1)
```

```output
null 2 0 1
0 null 0 1 0
0 null null
-1
```

### Errors

A first argument that is not a list or a string, `null` included, is a runtime error,
not an error value. A map is not searched: use [has](/docs/reference/has/) for its keys.

```quillo error
print(index_of(null, 1))
```

```output
line 1: `index_of` expects a list or str, got null
```

### Chaining

In a pipeline the list or text comes first and the value is the argument:

```quillo
print("abc" | index_of("c"), [1, 2] | index_of(2))
let i = index_of("key=value", "=")
print(slice("key=value", 0, i), slice("key=value", i + 1))
print(["a", "b"] | map((s) => index_of("xbx", s)))
```

```output
2 1
key value
[null, 1]
```

### See also

[contains](/docs/reference/contains/), [slice](/docs/reference/slice/), [find](/docs/reference/find/), [re.find](/docs/reference/re.find/), [has](/docs/reference/has/)
