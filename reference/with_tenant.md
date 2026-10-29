# with_tenant
with_tenant(str, fn) -> any
group: Tenants

### What it does

Runs the function for a tenant, with its database and its live updates, and gives what
the function gives. For signing a tenant up (its database is made and migrated the
first time code runs for it), and for code outside a request: a script, a scheduled
job that loops over the tenants. The name must be a valid tenant's name: lowercase
letters, digits, `-` and `_`, at most 63, starting with a letter or a digit. See
[Many tenants](/docs/structure/#many-tenants).

### Examples

```quillo noexec
route POST /signup { form: { name: str } } {
    with_tenant(name, () => db.exec("insert into settings (plan) values ('free')"))   // makes acme.db
    redirect(`https://${name}.example.com/`)
}

schedule("@daily", () => {
    for t in db.tenants() { with_tenant(t, () => db.exec("delete from tokens where expires < ?", now())) }
})
```

```quillo
print(with_tenant("acme", () => tenant()))
print(with_tenant("acme", () => 1 + 1))
```

```output
acme
2
```

### Edge cases

- The function's value comes back as it is, an error value included; `?` and `??`
  work on the result.
- Calls nest: inside, `tenant()` is the innermost name; afterwards the outer tenant
  (or none) is back, also when the function fails.
- A valid name may start with a digit and be 63 characters long; 64 is too many, and
  a capital letter, a space or a leading `-` is refused, so a name from a form is
  checked here before it can become a file or database name.
- Global variables are the same for every tenant: the function sees them as any code
  does.

```quillo
print(with_tenant("acme", () => err("no such plan")) ?? "defaulted")
print(with_tenant("9lives", () => with_tenant("a-b_c", () => tenant())), tenant())
print(with_tenant("x" | repeat(63), () => len(tenant())))
```

```output
defaulted
a-b_c null
63
```

### Errors

A name that cannot be a tenant's, a name that is not a string, and a second argument
that is not a function are runtime errors, not error values. A runtime error inside
the function is the call's.

```quillo error
with_tenant("Acme Inc", () => 1)
```

```output
line 1: `with_tenant`: "Acme Inc" cannot be a tenant's name (lowercase letters, digits, - and _)
```

```quillo error
with_tenant("x" | repeat(64), () => 1)
```

```output
line 1: `with_tenant`: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" cannot be a tenant's name (lowercase letters, digits, - and _)
```

```quillo error
with_tenant("acme", 42)
```

```output
line 1: `with_tenant` expects a function second, got int
```

### Chaining

The name is the first argument, so a pipeline hands it in; `db.tenants()` lists the
names to loop over:

```quillo
print("acme" | with_tenant(() => tenant()))
print(["acme", "beta"] | map((t) => with_tenant(t, () => upper(tenant()))))
```

```output
acme
["ACME", "BETA"]
```

### See also

[tenant](/docs/reference/tenant/), [tenant_from](/docs/reference/tenant_from/), [db.tenants](/docs/reference/db.tenants/), [db.open](/docs/reference/db.open/), [schedule](/docs/reference/schedule/)
