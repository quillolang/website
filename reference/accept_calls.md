# accept_calls
accept_calls(map) -> null
group: Jobs and services

### What it does

At the top level of a service, says which calls from other services it takes and how
each proves who makes it. Written as a declaration, `accept_calls { ... }`, it takes:

- `keys`: a key for each caller, by name, `{ shop: env("SHOP_KEY") }`. A caller that
  signs with its own key (`service billing = "billing.qwe" { auth: { key, as: "shop" }
  }`) is known by that name, and no other service can sign as it. A list of keys, `[new,
  old]`, takes either while one is rotated; answers are signed back with the key the call
  was signed with.
- `shared`: `false` refuses calls signed with the shared `QUILLO_SERVICE_SECRET`, which
  every service holding it can sign as any other. Taken by default.
- `jwt`: bearer tokens, as an identity provider issues them for services (OAuth 2.0's
  client credentials). `{ issuer, audience, jwks }` checks the token's signature
  against the provider's keys (RS256, ES256, EdDSA; a URL, kept ten minutes), or
  `secret` for HS256. `audience` is required, and so is `exp` in the token. The same
  rules check a visitor's token that a caller passes on with `forward`, as
  `request.user`.
- `client_cert: { header: "x-forwarded-client-cert" }`: the certificate a proxy checked
  (mutual TLS ended at the proxy), read from its header only when the request comes from
  an address `--trust-proxy` names. The name is the SPIFFE id's last part, or the
  subject's CN.
- `check: (caller) => ...`: anything else, in Quillo, run before the arguments are read.
  `false` refuses the call with a 403, an error value refuses it with its text, a map
  becomes the caller from then on, and `reply` answers the call itself.

Who called is `request.caller` in the `server fn`: `{ name, by }`, `by` being
`"quillo"`, `"key"`, `"jwt"` or `"mtls"`, with `scopes` and `claims` for a token and
`subject` and `uri` for a certificate. `server fn refund(...) for ["shop"]` takes calls
from those callers only (403 otherwise). It gives `null`.

### Examples

```quillo noexec
// billing.qwe
accept_calls {
    keys: { shop: [env("SHOP_KEY"), env("SHOP_KEY_OLD")], notify: env("NOTIFY_KEY") },
    shared: false,
    jwt: { issuer: env("IDP"), audience: "billing", jwks: env("IDP") + "/.well-known/jwks.json" },
    client_cert: { header: "x-forwarded-client-cert" },
    check: (caller) => caller.name != "mallory",
}

server fn refund(account: int, cents: int) for ["shop"] {
    { refunded: cents, by: request.caller.name }
}

server fn whoami() = { caller: request.caller, user: request.user, forwarded: request.forwarded }
```

```quillo
print(accept_calls({ keys: { shop: "shop-key-0123456789abcdef0123456789" } }))
```

```output
null
```

### Edge cases

- With neither `QUILLO_SERVICE_SECRET` nor `accept_calls`, a service takes no calls
  (403). With `accept_calls` and no secret, only what it names proves a caller.
- A call signed with the shared secret names its caller from version 3 of the
  signature on; one of version 2 has an empty name, so `for [...]` refuses it.
- A token without `exp`, for another audience or issuer, expired, or not good yet
  (`nbf`) is refused with a 401 that says which.
- The header named in `client_cert` sent by anyone else is refused, not believed.

```quillo
print(accept_calls({ shared: false }))
```

```output
null
```

### Errors

An option it does not take, an empty key (an environment variable not set), a `jwt`
without `audience` or without `jwks` or `secret`, or `accept_calls` with nothing in it,
is a runtime error as the program loads.

```quillo error
accept_calls { jwt: { secret: "s" } }
```

```output
line 1: `accept_calls`: `jwt` needs `audience`: a token for another service must not be taken here
```

```quillo error
accept_calls { keys: { shop: "" } }
```

```output
line 1: `accept_calls`: the key of `shop` is empty (is its environment variable set?)
```

```quillo error
accept_calls {}
```

```output
line 1: `accept_calls` with nothing in it takes what it took before: give keys, jwt, client_cert, check or shared: false
```

### Chaining

It is a declaration, written once at the top level of the service, not piped into or out
of. Its keys come from the environment:

```quillo noexec
accept_calls { keys: { shop: split(env("SHOP_KEYS") ?? "", ",") } }
```

### See also

[later.status](/docs/reference/later.status/), [ready](/docs/reference/ready/), [publish](/docs/reference/publish/), [env](/docs/reference/env/)
