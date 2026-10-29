# tenant
tenant() -> str | null
group: Tenants

### What it does

The name of the tenant the code runs for, or null. A request's tenant comes from the
rule `tenant_from` set (the subdomain, or a function of the request); code run with
`with_tenant(name, f)` has that name. It works in any function the request runs. Outside
a request, and in a program without tenants, it is null. See [Many
tenants](/docs/structure/#many-tenants).

### Examples

```quillo noexec
tenant_from("example.com")          // acme.example.com is tenant "acme"
db.open("data/{tenant}.db")

route GET / = <h1>Welcome, {tenant()}</h1>

fn settings() = cache[tenant()] ?? load_settings()
```

```quillo
print(tenant())
print(with_tenant("acme", () => tenant()))
```

```output
null
acme
```

### Edge cases

- No tenant is null, not the empty string: a request to the bare domain, a job, a
  script. `??` gives a name to use for those.
- Inside `with_tenant` it is that name, nested ones innermost first, and the outer
  value is back afterwards.
- A name is lowercase letters, digits, `-` and `_`, at most 63, starting with a letter
  or a digit, so it is safe in a file name or a database name.
- Global variables are shared by every tenant; keep a tenant's data in its database or
  in maps keyed by `tenant()`. A view that calls `tenant()` is never served from the
  view cache.

```quillo
print(tenant() ?? "shared")
print(with_tenant("acme", () => [tenant(), with_tenant("beta", () => tenant()), tenant()]))
print(tenant())
```

```output
shared
["acme", "beta", "acme"]
null
```

### Errors

It takes no arguments and never fails; a request for a host that names no tenant
gives null here and an error value from `db.*` calls, since there is no database to
open for it.

```quillo
print(tenant() == null)
```

```output
true
```

### Chaining

A name for a key or a path:

```quillo
print(with_tenant("acme", () => `data/${tenant()}.db`))
print(with_tenant("acme", () => tenant() | upper))
```

```output
data/acme.db
ACME
```

### See also

[tenant_from](/docs/reference/tenant_from/), [with_tenant](/docs/reference/with_tenant/), [db.open](/docs/reference/db.open/), [db.tenants](/docs/reference/db.tenants/)
