# cursor_index
cursor_index(str, int) -> int
group: Strings

### What it does

The place in `s`, in characters, of a field's cursor at `n`: a field's `selectionStart`
counts UTF-16 units, as JavaScript does, and `slice`, `len` and `s[i]` count characters.
Past an emoji or another character outside the first plane the two differ, and this
turns the one into the other. The same on the server and in the browser.

### Examples

```quillo
print(cursor_index("héllo", 3), cursor_index("😀 hi", 2), cursor_index("😀 hi", 3))
print(slice("😀 hi", cursor_index("😀 hi", 3)))
```

```output
3 1 2
hi
```

```quillo noexec
component Mention() {
    state text = ""
    <textarea @input={(e) => {
        text = e.value
        let at = cursor_index(text, e.target.selectionStart)
        let before = slice(text, 0, at)
    }}/>
}
```

### Edge cases

- Below 0 is 0, and past the end is the text's length.
- A cursor between the two halves of an emoji counts that emoji.

```quillo
print(cursor_index("abc", 0), cursor_index("abc", 9), cursor_index("abc", -2), cursor_index("", 4), cursor_index("😀", 1))
```

```output
0 3 0 0 1
```

### Errors

Text and an int, or it is a runtime error.

```quillo error
print(cursor_index(5, 1))
```

```output
line 1: `cursor_index` expects a str as argument 1
```

### Chaining

`text | cursor_index(n)` is `cursor_index(text, n)`.

### See also

[slice](/docs/reference/slice/), [len](/docs/reference/len/)
