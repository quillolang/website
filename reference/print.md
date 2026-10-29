# print
print(any...) -> null
group: General

### What it does

Writes its arguments to stdout as one line, each as text and a space between them,
and gives `null`. A string is written as it is; a value inside a list or map is written
as Quillo writes it, so a string there keeps its quotes. On the server the line goes to
the process's output; in a component it goes to the browser's console.

### Examples

```quillo
print("total:", 3, 2.5, true, null)
print([1, "x"], { a: 1, b: "x" })
print(`${1 + 1} items`)
```

```output
total: 3 2.5 true null
[1, "x"] { a: 1, b: "x" }
2 items
```

### Edge cases

- No arguments print an empty line, and so does the empty string.
- A whole float keeps its `.0`; a large float is written in full, never in exponent
  form (see [str](/docs/reference/str/)).
- A newline in a string is printed as a newline: the line becomes two.
- An error value is printed as `err("...")`, not as its payload.
- The result is `null`, so `print(print("x"))` prints `x` and then `null`.

```quillo
print()
print(2.0, 1e16, 0.1 + 0.2)
print("one\ntwo")
print(err("bad"), dec("1.50"))
print(print("inner"))
```

```output

2.0 10000000000000000 0.30000000000000004
one
two
err("bad") 1.50
inner
null
```

### Errors

`print` never fails: any value can be printed, and extra arguments are only more
columns. A value that cannot be shown in a useful way is still shown, as its kind.

```quillo
print(upper, (x) => x)
```

```output
<builtin upper> <fn <fn>>
```

### Chaining

In a pipeline the value comes first, so `x | print` prints it; `print` gives `null`,
so put it last.

```quillo
[3, 1, 2] | sort | print
"  hi  " | trim | upper | print
```

```output
[1, 2, 3]
HI
```

### See also

[str](/docs/reference/str/), [type_of](/docs/reference/type_of/), [join](/docs/reference/join/), [json.stringify](/docs/reference/json.stringify/)
