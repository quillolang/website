# repeat
repeat(str, int) -> str
group: Strings

### What it does

The text written a number of times in a row. It is the way to pad or rule a line, since
there is no `sprintf`.

### Examples

```quillo
print(repeat("ab", 3))
print(repeat("-", 10))
print(repeat("é", 3))
```

```output
ababab
----------
ééé
```

### Edge cases

- Zero times is the empty string, once is the text itself.
- Repeating the empty string is the empty string, however many times.
- The result's length is the text's length times the count, in characters.

```quillo
print(repeat("x", 0), repeat("ab", 1), repeat("", 5))
print(len(repeat("é", 3)))
```

```output
 ab 
3
```

### Errors

A negative count, or a result past 100 million bytes, is a runtime error, not an error
value; so is a text that is not a string or a count that is not an int. A count from a
float is converted with `int` first.

```quillo error
print(repeat("ab", -1))
```

```output
line 1: `repeat` count is negative or too large
```

```quillo error
print(repeat("ab", 100000000))
```

```output
line 1: `repeat` count is negative or too large
```

### Chaining

In a pipeline the text comes first and the count is the argument:

```quillo
print("ab" | repeat(2))
print(" Hi " | trim | lower | repeat(2))
let width = 8
print(repeat(" ", width - len("42")) + "42")
```

```output
abab
hihi
      42
```

### See also

[join](/docs/reference/join/), [slice](/docs/reference/slice/), [len](/docs/reference/len/), [format_number](/docs/reference/format_number/)
