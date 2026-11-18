# notification.stop
notification.stop() -> str
group: Notifications

### What it does

Ends this device's subscription, in an event handler, and gives `"default"` (`"denied"`
where the person blocked notifications) *(since 0.8.7)*. The server forgets the device, so
[notification.send](/docs/reference/notification.send/) no longer reaches it.

### Examples

```quillo noexec
component Alerts() {
    state on = notification.state()
    <button disabled={on != "granted"} @click={() => { on = notification.stop() }}>Stop telling me</button>
}
```

### Edge cases

- It removes only this visitor's own subscription.
- Signing out does it for every device subscribed in the session: `end_session()` unbinds
  them on the server.
- A session may turn devices on or off 30 times a minute; past that, a `429`.

### Errors

It is the browser's: `quillo check` refuses it in a route, a `server fn`, a tick, a job,
the top level and a component's body, and on the server it stops the request.

```quillo error
print(notification.stop())
```

```output
line 1: `notification.ask`, `notification.state` and `notification.stop` ask and read the browser: call them from an event handler of a component (`@click`); the server sends with `notification.send(user, { title, body, url })`
```

### See also

[notification.ask](/docs/reference/notification.ask/), [notification.state](/docs/reference/notification.state/), [end_session](/docs/reference/end_session/)
