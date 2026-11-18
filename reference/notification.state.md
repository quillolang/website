# notification.state
notification.state() -> str | null
group: Notifications

### What it does

Gives what [notification.ask](/docs/reference/notification.ask/) would give, without asking
*(since 0.8.7)*: `"granted"` while this device has a subscription, `"denied"` where the
person blocked notifications, `"default"` while it has none, and `"unsupported"` where the
page has no push. It is read in an event handler, or to set a state as the page starts,
where the server's render has `null` and the browser reads it.

### Examples

```quillo noexec
component Alerts() {
    state on = notification.state()
    <p>
        <button disabled={on == "granted"} @click={() => { on = notification.ask() }}>Turn on</button>
        <button disabled={on != "granted"} @click={() => { on = notification.stop() }}>Turn off</button>
    </p>
}
```

### Edge cases

- `null` in the server's render: a page should show something that fits until the
  browser has read it (a disabled button, as above).
- A subscription bound to someone other than the session's person (after a cookie that
  simply ran out, say) is unbound when the page finds it, and `state` then says
  `"default"`, so the next person turns on their own.
- The phone apps and `quillo app` say `"unsupported"` for now.

### Errors

It is the browser's: `quillo check` refuses it in a route, a `server fn`, a tick, a job and
the top level, and in a component's body other than as a state's initializer; on the
server it stops the request.

```quillo error
print(notification.state())
```

```output
line 1: `notification.ask`, `notification.state` and `notification.stop` ask and read the browser: call them from an event handler of a component (`@click`); the server sends with `notification.send(user, { title, body, url })`
```

### See also

[notification.ask](/docs/reference/notification.ask/), [notification.stop](/docs/reference/notification.stop/), [notification.send](/docs/reference/notification.send/)
