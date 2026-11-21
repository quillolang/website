# notification.ask
notification.ask(map | null=) -> str | error(str)
group: Notifications

### What it does

In an event handler, asks the person whether this device may show the site's
notifications, subscribes the device with the server's key, and sends the subscription to
the server, which binds it to `session().user` *(since 0.8.7)*. It registers Quillo's
service worker if it is not there. It gives `"granted"`; `"denied"` or `"default"` when the
person said no or closed the prompt; `"unsupported"` where the page has no push, and when
the browser gives no answer in 20 s; or an error value with the server's reason, the
subscription it made undone. `{ user: ticket }` names someone who is not `session().user`,
with a ticket the server made with [notification.user](/docs/reference/notification.user/).
The server then reaches the device with [notification.send](/docs/reference/notification.send/).

### Examples

```quillo noexec
component Alerts() {
    state on = notification.state()            // "granted", "denied", "default" or "unsupported"
    <button disabled={on == "granted"} @click={() => { on = notification.ask() }}>Tell me when it ships</button>
}
```

A guest who placed an order, named by a ticket the server sealed:

```quillo noexec
component Track(ticket: str) {
    state on = notification.state()
    <button disabled={on == "granted"} @click={() => { on = notification.ask({ user: ticket }) }}>Tell me when it ships</button>
}

route GET /thanks {
    let order = session().order
    <html><body><h1>Order {order} is placed</h1><Track ticket={notification.user(`order-${order}`)}/></body></html>
}
```

### Edge cases

- Ask first in the handler: browsers show the prompt only close to the click (Safari only
  within it), and `quillo check` warns of an `ask` after a `server fn` call, `http.*` or
  another call that waits in the same handler (`` `notification.ask` comes after `save`
  waits in this handler: ... ``).
- Asked again, it keeps the subscription it has, and makes a new one for a key that
  changed.
- A visitor not signed in, with no ticket, gets an error value (`notification.ask: no one
  to send to: the visitor is not signed in (session().user), ...`). A plain value as
  `user` is refused, as any page could then name someone else.
- `end_session()` and any change of person unbind the devices subscribed in that session.
- An iPhone or iPad gives push only to a web app added to the Home Screen: in a Safari tab
  it gives `"unsupported"`, as the phone apps and `quillo app` do for now, and a page of a
  mounted program.
- A page whose scope already has a service worker of the program's own gets an error
  value, rather than have Quillo's replace it.
- A session may turn devices on or off 30 times a minute; past that, a `429`.
- Browsers give notifications only to a page served over HTTPS, or from this machine.

### Errors

It is the browser's: `quillo check` refuses it in a route, a `server fn`, a tick, a job,
the top level and a component's body, and on the server it stops the request.

```quillo error
print(notification.ask())
```

```output
line 1: `notification.ask`, `notification.state` and `notification.stop` ask and read the browser: call them from an event handler of a component (`onclick`); the server sends with `notification.send(user, { title, body, url })`
```

### See also

[notification.state](/docs/reference/notification.state/), [notification.stop](/docs/reference/notification.stop/), [notification.send](/docs/reference/notification.send/), [notification.user](/docs/reference/notification.user/), [ask](/docs/reference/ask/)
