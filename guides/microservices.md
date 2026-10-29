# Microservices

In Quillo a microservice is a `service`: a program whose `server fn`s other programs call
as if they were their own functions. The same code runs in one process or split across
servers, so an app can start as one program and be split when there is a reason to,
without its code changing. This page puts together what [Routes](/docs/routes/#services)
says about services; [examples/services](/docs/examples/services/) is a shop that bills
through a billing service.

### Declaring a service

`service` names a program and gives it a name to call it by. Its `server fn`s are then
functions of that name:

```quillo
// shop.qwe
service billing = "billing.qwe"

route POST /buy {
    let inv = billing.invoice(request.form.name, 1200)?    // billing's `server fn invoice`
    <p>Invoice #{inv.id}</p>
}
```

The app is made of its services. With a path, a service's routes are served under it too,
and it is named after its file:

```quillo
// app.qwe
service /shop = "shop.qwe"
service /billing = "billing.qwe"
```

A program with `server fn`s and no routes is served as well: a service may be only that.
Services may use one another.

### One process or many

- **In one process**, the default, a service is loaded once and shared by every program
  in the process that names it: one copy of its variables and of its database. A call
  goes straight to it, with nothing on the network.
- **Split**, a service runs on a server of its own, and its calls go there as signed
  HTTP requests. Run alone, a service is an ordinary program; `--base` is the path it is
  served under, which its links and redirects carry.
- **`--split`** runs each service the app declares (and those they declare) as a
  process of its own, each on its own port, its log lines marked with its name, all
  signed with one secret. They stop with the app. It is the quickest way to see an app
  as it would run split, on one machine.

```sh
# Everything in one process
quillo run app.qwe

# Each service as a process of its own, on this machine
quillo run app.qwe --split

# Split across servers: billing on 10.0.0.5, the app elsewhere
QUILLO_SERVICE_SECRET=... quillo run billing.qwe --port 8081 --base /billing
QUILLO_SERVICE_SECRET=... quillo run app.qwe --service-url billing=http://10.0.0.5:8081
```

`--service-url billing=...` can also be given as `QUILLO_SERVICE_BILLING`. Every service
and every caller needs the same `QUILLO_SERVICE_SECRET`; without it, a call to a service
that runs elsewhere is an error value saying so, not an unsigned request.

### What crosses the wire

What crosses is data, as JSON, whichever way the service runs: arguments and results are
copied, and a function arrives as `null`. A program therefore behaves the same in one
process and split. Optional arguments left out are not sent, so the service's own
defaults apply.

A call that cannot be made (the service is not answering, every address is failing) is
an error value, like any other: `?` passes it on and `??` replaces it.

```quillo
route POST /buy {
    let inv = billing.invoice(request.form.name, 1200) ?? reply 503 "Billing is busy; try again in a moment"
    <p>Invoice #{inv.id}</p>
}
```

### The payload

A call sends its arguments and gets a value back. What goes each way, exactly:

- **Arguments** go as a JSON array, in the order of the parameters. An optional argument
  left out is not sent, so the service's own default applies, whichever version of the
  service answers.
- **A record** (a `type`) goes as the map of its fields. The service's parameter type
  checks it on arrival, as it checks a page's call, and fills the defaults the type
  declares: `billing.invoice({ customer: "Zed", cents: 5 })` arrives with `note: ""`
  when `Order` says so. The same record type is declared in both files, since each is a
  program of its own; a `use`d file can hold it for both.
- **Numbers** keep their kind: an int stays an int, a float a float (`2.0` is not
  turned into `2`), a decimal a decimal with its scale (`12.50`). Strings, booleans,
  lists, maps and `null` go as they are.
- **A function cannot go.** Across the network it arrives as `null`. Send what the
  function would have computed, or a name the service understands.
- **The result** is the function's value, or its error: `?` and `??` work on it as on
  any call. A wrong argument (a `str` for an `int`) is refused by the service before the
  function runs, with the same message `quillo check` would have given.

```quillo
// billing.qwe
type Order = { customer: str, cents: int, note: str = "" }

server fn invoice(o: Order) -> map ! str {
    if trim(o.customer) == "" { return err("An invoice is for someone") }
    ...
}

// shop.qwe, calling it
type Order = { customer: str, cents: int, note: str = "" }

route POST /buy { json: Order } {
    let inv = billing.invoice(Order(request.json)) ?? reply 400 "Billing refused the order"
    { invoice: inv }
}
```

What this is on the wire, for a balancer's rules, a log, or a service written in
another language: `POST <service>/_quillo/service/<fn>` with the arguments as the JSON
body and these headers:

| Header | Carries |
|---|---|
| `x-quillo-service` | `t=<unix seconds>,sig=<hex>`: the time and the signature |
| `x-quillo-to` | the service's name, as the caller knows it |
| `x-quillo-call` | the call's id, up to 64 letters and digits, remembered by the service |
| `x-quillo-caller` | the calling program's name |
| `x-quillo-deadline` | milliseconds the caller still waits |
| `x-quillo-contract` | the function's contract as the caller's copy declares it |
| `x-quillo-tenant` | the tenant, when there is one |
| `x-request-id` | the request's id, passed down the chain |

The signature is HMAC-SHA256 under `QUILLO_SERVICE_SECRET` of the text
`quillo-service-2`, the time, the service, the function, the tenant and the call id,
each followed by a line break, then the body. The time must be within five minutes.
The answer is `{"ok": value}` or `{"err": payload}`, with `"published": [...]` when the
call published topics. Otherwise: 400 for an argument of the wrong type, 401 for a bad
or old signature or a call meant for another service, 404 for no such function, 409
when the contracts differ (the answer says both), 503 while the same call is still
running. A call sent twice with the same id gets the same answer and runs once.

### A chain of calls

Services may use one another: the app calls the shop, the shop calls billing, billing
posts to a ledger. Each link is an ordinary call, so the chain is written as three
functions calling each other:

```quillo
// shop.qwe
service billing = "billing.qwe" { timeout: "2s", retries: 1 }

route POST /buy { json: Order } {
    let inv = billing.invoice(Order(request.json))?
    { invoice: inv }
}

// billing.qwe
service ledger = "ledger.qwe"

server fn invoice(o: Order) -> map ! str {
    if trim(o.customer) == "" { return err("An invoice is for someone") }
    let inv = { id: len(invoices) + 1, customer: trim(o.customer), cents: o.cents, note: o.note }
    invoices = invoices + [inv]
    ledger.post(`inv-${inv.id}`, inv.cents)?        // the ledger's error is the invoice's
    inv
}

// ledger.qwe
let posted = {}

server fn post(ref: str, cents: int) -> int ! str {
    if cents <= 0 { return err("nothing to post") }
    if has(posted, ref) { return posted[ref] }      // a step done already is not done twice
    posted = set(posted, ref, cents)
    cents
}
```

What holds across the links:

- **Errors come back up.** `ledger.post` refusing `cents: 0` makes `billing.invoice`
  an error (`?` passes it on), which the shop's `?` turns into its answer: the caller
  three links up sees `nothing to post`. Replace it where it is yours to handle
  (`?? reply 400 ...`) and pass it on where it is not.
- **Each link commits by itself.** There is no transaction across services: billing's
  invoice is written whether or not the ledger takes the posting. So each step takes a
  reference the caller makes up (`inv-7`) and keeps what it did, as `post` does above:
  a request sent again goes on from where it stopped instead of posting twice.
- **The chain gives up together.** Each call carries the time its caller still waits
  (`x-quillo-deadline`), and the calls made below wait no longer than that, or their own
  `timeout` when shorter. When the shop's two seconds are up, billing's call to the
  ledger stops waiting too, and a call with no time left is not made. What a service is
  already doing runs to its end.
- **One id all the way down.** The request's `x-request-id` (or the one made for it)
  goes with every call. With `--log json` the caller logs each call as a line of its
  own, beside the request's:

```json
{"time":"2026-10-29T03:30:43.727Z","service":"ledger","fn":"total","url":"http://127.0.0.1:56782","status":200,"ms":0.18,"tries":1,"rid":"req-44"}
{"time":"2026-10-29T03:30:43.727Z","method":"GET","path":"/","status":200,"ms":0.26,"ip":"127.0.0.1","rid":"req-44"}
```

- **A call runs once.** A retry sends the same call id, and a service remembers the ids
  it answered, so a link that was answered but not heard is not run again; the chain
  below it is not run again either.
- **Only `server fn`s are reachable.** A service's routes, globals and plain functions
  are its own. What the next link needs, it gets as an argument.
- **In one process it is all function calls**, with nothing on the network, no
  timeouts and no retries; the same code, split, gets all of the above.

### Querying the API: `quillo docs` and `--describe`

A program's API is written from its source, as OpenAPI 3, so a gateway, a client
generator or a reviewer can read what a service takes without running it:

```sh
quillo docs app.qwe                 # to stdout
quillo run app.qwe --describe       # the same at GET /_quillo/describe
```

Each route is a path with its method; a query pattern becomes `parameters`, a `json:`
pattern a `requestBody` schema, and `x-quillo-at` says where in the source the route is:

```json
"/payments": {
  "post": {
    "requestBody": {
      "required": true,
      "content": { "application/json": { "schema": {
        "type": "object",
        "properties": { "to": { "type": "string" }, "amount": { "type": "string", "format": "decimal" } },
        "required": ["to", "amount"]
      } } }
    },
    "x-quillo-at": "app.qwe:6"
  }
}
```

A record type in a pattern or a parameter is named rather than expanded
(`"schema": { "x-quillo-type": "Order" }`). Each `server fn` is under
`x-quillo-server-fns` with its contract, its parameters and what it returns or fails
with:

```json
"invoice": {
  "contract": "invoice(o: Order) -> map ! str",
  "params": [{ "name": "o", "schema": { "x-quillo-type": "Order" }, "required": true }],
  "returns": { "type": "object" },
  "error": { "type": "string" }
}
```

Run on the app, the document holds the routes of the services served under their
prefixes (`/shop/buy`, `/billing`) and their `server fn`s keyed by prefix and name
(`"/billing invoice"`); a service declared without a path, only called, is described
by running `quillo docs` on its own file.

The `contract` line is what a call carries in `x-quillo-contract`, and what a service
checks it against. A service deployed apart whose own differs refuses the call with
409 and says both sides:

```
service ledger: 409 `total` here is `total() -> int`; the caller's copy of this service says `total() -> str`
```

So a caller's `.qwe` copy of a service is its client stub: keep the `server fn`
signatures in it in step with the service, and `quillo check` plus the contract check
catch the rest. For a service written in another language, that copy is what
`quillo check` reads, and the server must answer `/_quillo/service/<fn>` as
[The payload](#the-payload) describes and `GET /_quillo/ready`.

### Checked before it runs

`quillo check` checks each call against the service's `server fn`s: their names, the
number and types of their arguments, and that the result may be an error. A call needs
the `http` effect, so a function declared `with db` cannot quietly reach another
server. The browser cannot call a service: components call the program's own
`server fn`s, which may call services.

```quillo
fn checkout(name: str) with http = billing.invoice(name, 1200)
```

### Calls that hold up

When a service runs elsewhere, its calls are made to survive slow and failing servers.

#### Several addresses

The same service can run on several servers, called in turn:

```sh
quillo run app.qwe --service-url billing=http://10.0.0.5:8081,http://10.0.0.6:8081
```

#### Retries that run once

A call that got no connection, or a server answering 502, 503 or 504, is tried at the
next address, a little later each time. A call sent but not answered in time is tried
again at the same address, with the same call id. The service remembers the calls it
answered for eleven minutes (in its database too, `_quillo_calls`, when it has one, so
copies sharing it remember together) and gives the same answer again, so the function
runs once however often the call is sent. A call still running there is waited for.

#### Failing servers left alone

An address that fails several calls in a row is left alone for a while (its circuit is
open), then tried with one call; the other addresses take its calls meanwhile. Each time
it fails again it is left alone twice as long, up to sixteen times the cooldown. When
every address is left alone, a call fails at once with an error value saying so, instead
of waiting on servers that are down.

#### Options

Set where the service is declared, after the file:

```quillo
service billing = "billing.qwe" { timeout: "2s", retries: 1, failures: 5, cooldown: "5s" }
```

| Option | Default | What it sets |
|---|---|---|
| `timeout` | `"10s"` | How long one try may take |
| `retries` | `2` | How many times a call is tried again, 0 to 10 |
| `failures` | `5` | Failures in a row after which an address is left alone |
| `cooldown` | `"5s"` | How long it is left alone the first time |

Durations are `"500ms"`, `"2s"`, `"1m"` (`ms`, `s` and `m` only), or a number of
milliseconds. They apply when a service runs elsewhere; in one process a call is a
function's, which runs to its end.

### Following a request across services

Each request has an id: the `x-request-id` it came with (from a proxy or a load balancer),
or one made for it. Its answer carries it, the code sees it as `request.id`, and every
call to a service passes it on, so one request can be followed through every service it
reached.

With `--log json`, the request log shows the id as `"rid"`, and each call to a service is
a line of its own: the service, the function, the address, the status, how long it took,
the tries and the id.

### Calls made later

Some calls need not hold up the request: a receipt to send, a report to make.
`.later` keeps the call and makes it in the background:

```quillo
route POST /orders/:id(int)/paid {
    billing.later.invoice(`order ${id}`, 1200)    // the call's id, at once
    redirect(`/orders/${id}`)
}
```

The call is tried every second, then a little later each time (up to five minutes apart),
until it gets through; since the service remembers call ids, it runs once. Calls kept for
later are stored in the program's database when it has one (the `_quillo_later` table),
so they outlive a restart, and servers sharing the database make each call once; without
a database, in a `quillo-system.db` file next to the program. `quillo check` checks them
as it checks the call itself.

### What it does not do

- **No transaction across services.** Each service's `db.transaction` is its own, so a
  chain of calls commits step by step. Give each step a reference the caller makes up,
  and keep what was done, so a request sent again goes on from where it stopped instead
  of doing a step twice.
- **No discovery.** Each caller is told where a service runs (`--service-url` or
  `QUILLO_SERVICE_<NAME>`), and `QUILLO_SERVICE_SECRET` is set on every machine by hand.
  A copy can join a running app with `--join`, but it is recorded at the address it
  connects from, so a copy behind NAT or a proxy belongs behind a balancer instead.
- **Variables are each copy's.** Copies of a service (`--scale`, `--join`, several
  addresses) share its database, not its global variables.
- **A service's own publishing.** A topic a service publishes while answering a call
  reaches the caller's pages; one it publishes on its own (a job, a call made later
  being delivered) reaches only the service's pages when it runs apart.

[Services](/docs/routes/#services) in the reference has the rest: `--scale`, `--join`,
`/_quillo/ready`, live data across services, and copies behind a balancer.

### Security

- A call is signed with HMAC-SHA256 under `QUILLO_SERVICE_SECRET`, together with the
  time, the service it is for, the function, the tenant, the call's id and its
  arguments; a call more than five minutes old, or signed for another service, is
  refused. The tenant goes with it.
- Only `server fn`s are offered at `/_quillo/service/<name>`: a service's other functions
  and its globals cannot be reached from outside.
- A service's routes, under its prefix, are passed on to it, and are public as any route
  is: guard them as you would in one program.

### The example

[examples/services](/docs/examples/services/) is a shop (`shop.qwe`) that bills through
a billing service (`billing.qwe`), put together by `app.qwe`. The shop declares billing
with a two-second timeout and one retry. Run it in one process with
`quillo run services/app.qwe` (in a clone of [quillolang/examples](https://github.com/quillolang/examples)), or split with `--split`.
