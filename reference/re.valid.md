# re.valid
re.valid(any, str | null=) -> bool
group: Regular expressions

### What it does

Whether a pattern can be run, for one that comes from data or a person. A pattern that cannot
stops `re.test` and the others, so ask first, or guard the call with `??`.

### Examples

```quillo
print(re.valid("a+"))
print(re.valid("a+", "i"))
print(re.valid("a(?=b)"))
```

```output
true
true
false
```
