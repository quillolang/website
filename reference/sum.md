# sum
sum(list | null) -> any
group: Lists

### What it does

The items added together, starting from `0`. Ints give an int, a float anywhere gives
a float, and decimals stay exact and give a decimal. An empty list or `null` gives
`0`.

### Examples

```quillo
print(sum([1, 2, 3]))
print(sum([1, 2.5]))
print(sum([dec("0.10"), dec("0.20")]))
let orders = [{ total: 10 }, { total: 7 }]
print(sum(map(orders, (o) => o.total)))
```

```output
6
3.5
0.30
17
```

### Edge cases

- `sum([])` and `sum(null)` are `0`, an int.
- Floats add as floats do: `0.1 + 0.2` is `0.30000000000000004`. Decimals do not
  drift, and an int with a decimal gives a decimal.
- A total of ints that passes what an int holds is a runtime error, not a float.
- The items are added with `+`, so strings join rather than add: `sum(["a", "b"])` is
  the text `"0ab"`, the start value in front. Use [join](/docs/reference/join/) for text.

```quillo
print(sum([]), sum(null), type_of(sum([])))
print(sum([0.1, 0.2]), sum([dec("0.1"), dec("0.2")]), sum([dec("1.5"), 2]))
print(sum(["a", "b"]))
```

```output
0 0 int
0.30000000000000004 0.3 3.5
0ab
```

### Errors

An argument that is not a list or `null` is a runtime error, not an error value. An
item that `+` cannot add to the total so far (`null`, a boolean, a list, a map) is a
runtime error, and so is a decimal met with a float, or an int overflow.

```quillo error
print(sum([1, null, 2]))
```

```output
line 1: cannot add int and null
```

```quillo error
print(sum([dec("0.1"), 0.2]))
```

```output
line 1: cannot add dec and float: a dec is exact and a float is not, so convert one with dec(x) or float(x)
```

```quillo error
print(sum([9223372036854775807, 1]))
```

```output
line 1: integer overflow
```

### Chaining

In a pipeline `sum` takes the list and needs no arguments: `xs | map(f) | sum`.

```quillo
print([1, 2, 3, 4] | filter((x) => x % 2 == 0) | sum)
print("1,2,3" | split(",") | map(int) | sum)
print(range(1, 101) | sum)
```

```output
6
6
5050
```

### See also

[reduce](/docs/reference/reduce/), [min](/docs/reference/min/), [max](/docs/reference/max/), [count](/docs/reference/count/), [stats.mean](/docs/reference/stats.mean/), [math.fsum](/docs/reference/math.fsum/)
