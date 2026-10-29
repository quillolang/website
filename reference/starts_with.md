# starts_with
starts_with(str, str) -> bool
group: Strings

### What it does

Whether the text begins with a prefix. The comparison is exact: case matters and the
prefix is plain text, not a pattern.

### Examples

```quillo
print(starts_with("hello", "he"), starts_with("hello", "He"))
print(starts_with("/api/users", "/api/"))
```

```output
true false
true
```

### Edge cases

- Every string starts with `""`, the empty string included.
- A string starts with itself; a prefix longer than the text is `false`.
- Characters, not bytes: `starts_with("héllo", "hé")` is `true`.

```quillo
print(starts_with("hello", ""), starts_with("", ""))
print(starts_with("hello", "hello"), starts_with("hello", "hellos"))
print(starts_with("héllo", "hé"))
```

```output
true true
true false
true
```

### Errors

An argument that is not a string, on either side, is a runtime error, not an error
value: `null` and numbers are refused. Give a `null` field `?? ""` first.

```quillo error
print(starts_with("abc", 1))
```

```output
line 1: `starts_with` expects a str as argument 2, got int
```

### Chaining

In a pipeline the text comes first and the prefix is the argument:

```quillo
print("Hello" | starts_with("H"))
print(["/api/a", "/web", "/api/b"] | filter((p) => p | starts_with("/api/")))
print(("Hello" | starts_with("H")) && ("Hello" | ends_with("o")))
```

```output
true
["/api/a", "/api/b"]
true
```

### See also

[ends_with](/docs/reference/ends_with/), [contains](/docs/reference/contains/), [index_of](/docs/reference/index_of/), [slice](/docs/reference/slice/), [re.test](/docs/reference/re.test/)
