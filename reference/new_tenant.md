# new_tenant
new_tenant(str, fn) -> any
group: Tenants

### What it does

Makes a tenant's database, migrates it, and runs the function for that tenant, giving what
the function gives. When the tenant exists it runs nothing and gives an error value, so a
second signup for a name cannot land in a customer's data. Making it is one step on the
database, so of two signups at once one makes it. The name must be a valid tenant's name:
lowercase letters, digits, `-` and `_`, at most 63, starting with a letter or a digit. See
[Many tenants](/docs/structure/#many-tenants).

### Examples

```quillo noexec
route POST /signup { form: { name: str } } {
    let made = new_tenant(name, () => db.exec("insert into settings (plan) values ('free')"))
    if is_err(made) { reply 409 "That name is taken" }
    redirect(`https://${name}.example.com/`)
}
```

### Edge cases

- It needs a database per tenant, with `{tenant}` in its target or a function; otherwise it
  stops the code.
- A visitor may read the error: it says only that the name is taken.
- A name that is not a tenant's stops the code. Names such as `www` and `admin` are valid,
  and are the program's to refuse.
- With `postgres://host/app_{tenant}` you make each database beforehand, so there it finds
  the database and says the name is taken: use [with_tenant](/docs/reference/with_tenant/).
