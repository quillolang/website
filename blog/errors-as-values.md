---
title: Errors you can hold
date: 2024-09-04
summary: Exceptions jump past the code that could have handled them. An error that is a value can be passed on, given a fallback or answered with, in one character.
tags: design, language
---
A web request fails in ordinary ways: a number that is not a number, a row that is not there, another service that does not answer. With exceptions, each of these leaves the code where it happened and lands somewhere else, often a generic 500. The code in between never had to think about it, which is the problem.

### An error is a value

```quillo
fn parse_age(s: str) -> int ! str =
    match int(s) {
        int as n if n >= 0 => n
        _ => err(`bad age: ${s}`)
    }
```

`int("abc")` does not throw. It gives an error value, which the `match` sees like any other value. `-> int ! str` says what the function returns, and what its errors carry.

### Three ways to deal with one

- **Pass it on** with `?`: `fn next_year(s) = parse_age(s)? + 1` returns the error from `next_year` as it is.
- **Fall back** with `??`: `let age = int(request.query.age) ?? 18`.
- **Answer with it** with `reply`, from anywhere: `let user = load(id) ?? reply 404 "no such user"`.

Each is one or two characters, so handling an error is never much more work than ignoring it, and ignoring it is visible.

### Mistakes are different

A failed lookup is an outcome. Calling a number as a function is a mistake in the program. Those stay runtime errors, and a route that hits one answers 500 and logs it. Keeping the two apart means the errors you can expect are values you handle, and the rest are bugs you fix.

> **Since then:** error values, `?`, `??` and `reply` are how Quillo code deals with failure, and `quillo check` checks the `!` types. See [Errors](/docs/language-tour/#errors).
