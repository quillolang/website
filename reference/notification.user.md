# notification.user
notification.user(any) -> str | error(str)
group: Notifications

### What it does

Seals `x` into a ticket a page gives to [notification.ask](/docs/reference/notification.ask/)
(`{ user: ticket }`), for someone who is not signed in as `session().user`: a guest who
placed an order, a program that names its people another way *(since 0.8.7)*. The device
is then bound to `x`, and `notification.send(x, ...)` reaches it. The ticket is good for 30
days, for this program and for the session it was made in, and it ends with that session.
It is made in a route or a `server fn`.

### Examples

```quillo noexec
route GET /thanks {
    let order = session().order                  // set at checkout, for a guest who is no user
    <html><body><h1>Order {order} is placed</h1><Track ticket={notification.user(`order-${order}`)}/></body></html>
}

fn staff(r) = session().role == "staff" ? r : respond(403, "staff only")

routes /staff | staff {
    route POST /orders/:id(int)/ship = notification.send(`order-${id}`, { title: "Shipped", url: "/thanks" })
}
```

### Edge cases

- It works only from the session it was made in, so a ticket someone else saw is of no
  use to them; after a change of person on that session it is refused.
- A request with no session makes none (an error value): a sign-in route's own
  `set_session` counts, so set the session first.
- `x` is compared as JSON when sending: the int `7` and the text `"7"` are two people.
- In a component it is refused, as the component runs in the browser too: make the ticket
  in the route, or in a `server fn`.

### Errors

Outside a request with a session, the answer is an error value:

```quillo
print(notification.user("order-7"))
```

```output
err("notification.user: this request has no session to seal it for, and a ticket of no session could be used by anyone who saw it: set_session first (a cart, a sign-in), then make it")
```

### See also

[notification.ask](/docs/reference/notification.ask/), [notification.send](/docs/reference/notification.send/), [set_session](/docs/reference/set_session/)
