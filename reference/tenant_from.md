# tenant_from
tenant_from(str | fn) -> null
group: Tenants

### What it does

Says how a request's tenant is found, at the top of a program. With a domain,
`tenant_from("example.com")`, the tenant is the part of the host before it:
`acme.example.com` is `acme`. With a function, `tenant_from((request) => ...)`, the
tenant is what the function gives for the request (a header, a path segment, a
lookup), a name or null. A name is lowercase letters, digits, `-` and `_`, at most 63,
starting with a letter or a digit; anything else is no tenant. It gives null. See
[Many tenants](/docs/structure/#many-tenants).

### Examples

```quillo noexec
tenant_from("example.com")          // acme.example.com is tenant "acme"
db.open("data/{tenant}.db")         // a SQLite file per tenant
db.migrate()

route GET / = <h1>Welcome, {tenant()}</h1>
```

```quillo noexec
tenant_from((request) => request.headers["x-tenant"])

let registry = db.connect("registry.db")
db.open((tenant) => registry.one("select url from tenants where name = ?", tenant)?.url)
```

```quillo
print(tenant_from("example.com"))
print(tenant())
```

```output
null
null
```

### Edge cases

- The domain is read without case and without a leading dot: `".Example.COM"` is
  `example.com`. It is a bare domain, not a URL: no `/` or `:` in it.
- Setting the rule gives no tenant to the code at the top of the program: `tenant()`
  there is still null. The rule is applied to each request.
- A request whose host does not fit (the bare domain, another domain, a subdomain
  that is not a valid name) has no tenant: `tenant()` is null and `db.*` calls give an
  error value. A made-up subdomain opens no database.
- A function is asked for every request; what it gives is checked as a name, so a
  value from a header cannot reach a file or database name unchecked.
- The last `tenant_from` call wins.

```quillo
print(tenant_from(".Example.COM"), tenant())
print(tenant_from((req) => req.headers["x-tenant"]), tenant())
```

```output
null null
null null
```

### Errors

An empty domain, one with a `/` or a `:`, and an argument that is neither a string
nor a function are runtime errors, not error values.

```quillo error
tenant_from("https://example.com/")
```

```output
line 1: `tenant_from` needs a domain such as "example.com", got "https://example.com/"
```

```quillo error
tenant_from(42)
```

```output
line 1: `tenant_from` expects a domain or a function of the request, got int
```

### Chaining

It stands alone at the top of the program, before `db.open`. To sign a tenant up from
a request that has none yet, use `with_tenant`:

```quillo noexec
tenant_from("example.com")
db.open("data/{tenant}.db")

route POST /signup { form: { name: str } } {
    with_tenant(name, () => db.exec("insert into settings (plan) values ('free')"))   // makes acme.db
    redirect(`https://${name}.example.com/`)
}
```

### See also

[tenant](/docs/reference/tenant/), [with_tenant](/docs/reference/with_tenant/), [db.open](/docs/reference/db.open/), [db.tenants](/docs/reference/db.tenants/)
