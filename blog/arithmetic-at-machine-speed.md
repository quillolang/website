---
title: Arithmetic at machine speed
date: 2026-05-24
summary: An interpreter is slow at loops of numbers. Quillo compiles the functions that only do arithmetic to machine code, and gives the same answers as before.
tags: performance, features
---
A tree-walking interpreter was the right way to start, and it is slow at one thing in particular: tight loops over numbers. A pricing rule, a score, a distance, a checksum: small functions called often, where most of the time goes to walking the tree.

### Compiled, the second time

A top-level function that only does arithmetic on ints, floats and bools is compiled to machine code, with Cranelift, the second time it is called. `let`, assignment, `if`, `while`, `for` over a range, `return`, and calls to other such functions, itself included.

```quillo
fn fib(n: int) -> int = n < 2 ? n : fib(n - 1) + fib(n - 2)
```

The guide's own measurement: `fib(32)` takes 11 ms (Node 11, Bun 21), and a loop of ten million steps 29 ms.

### The same answers

Compiled code must not behave differently, or it is a different language. So ints stay 64-bit and overflow is still an error, `%` by zero is still an error, ordering NaN is still an error, and the call-depth limit holds. Where the interpreter would fail, the machine code gives up and the interpreter runs the call again, and fails as it always did. Since the function only computes, running it twice is the same as running it once.

### What stays interpreted

Strings, lists, maps, decimals, builtins, and `/` between two ints, whose answer can be an int or a float. These run as before. No annotation decides it: the compiler takes what it can prove is safe, and leaves the rest.

> **Read more:** [Compiled numbers](/docs/compiled-numbers/) in the docs.
