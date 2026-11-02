# new_tenant
new_tenant(str, fn) -> any
group: Tenants

### What it does

Makes a tenant's database, migrates it, and runs the function for that tenant, giving what
the function gives. When the tenant exists it runs nothing and gives an error value, so a
second signup for a name cannot land in a customer's data. Making it is one step on the
database, so of two signups at once one makes it. The name must be a valid tenant's name:
lowercase letters, digits, `-` and `_`, at most 63, starting with a letter or a digit. See
[Many tenants](/docs/standard-library/#many-tenants).

### Examples

A signup: a database per tenant, the form on the bare domain, the route it posts
to, and the new tenant's own site. `migrations/001_settings.sql` holds
`create table settings (plan text not null);`, and `new_tenant` runs it for each new
database before the function. The name is checked first, since one that cannot be a
tenant's stops the code (a 500), where a taken one is only an error value:

```quillo noexec
tenant_from("example.com")             // acme.example.com is tenant "acme"
db.open("data/{tenant}.db")            // a SQLite file per tenant, made by new_tenant
db.migrate()

route GET /signup =
    <form method="post" action="/signup">
        <label>Your site <input name="name" pattern="[a-z0-9][a-z0-9_-]*" required/>.example.com</label>
        <button>Create</button>
    </form>

route POST /signup { form: { name: str } } {
    if tenant() != null { reply 404 "Sign up at example.com" }
    if !re.test(name, "^[a-z0-9][a-z0-9_-]{0,62}$") { reply 400 "Letters, digits, - and _" }
    if name == "www" || name == "admin" { reply 409 "That name is taken" }
    let made = new_tenant(name, () => db.exec("insert into settings (plan) values ('free')"))
    if is_err(made) { reply 409 "That name is taken" }
    redirect(`https://${name}.example.com/`)
}

route GET / {
    if tenant() == null { return redirect("/signup") }
    let s = db.one("select plan from settings")
    <h1>{tenant()}: the {s.plan} plan</h1>
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
