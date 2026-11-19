# notification.send
notification.send(any, map) -> map | error(str)
group: Notifications

### What it does

Sends a notification to each device a person turned on with
[notification.ask](/docs/reference/notification.ask/), the page open or not, over Web Push
that Quillo sends itself *(since 0.8.7)*. It gives `{ sent, gone }`: how many push services
took it, and how many said the device's subscription had ended (a `404` or `410`), which is
then dropped. The person is what `session().user` held when the device subscribed, or the
`x` of [notification.user](/docs/reference/notification.user/). The message is a map:
`title` (required, the line the device shows first), `body`, `url` (a path on this site,
opened by a click; `/` when left out), `tag`, `badge`, `silent`, `ttl` and `urgency`. It
works in a route, a `server fn`, a job and a tick. See [Installable apps, offline pages and
notifications](/docs/pwa/).

### Examples

```quillo noexec
fn staff(r) = session().role == "staff" ? r : respond(403, "staff only")

routes /staff | staff {
    route POST /orders/:id(int)/ship {
        let o = db.one("update orders set shipped = 1 where id = ? returning user_id", id)
        notification.send(o.user_id, { title: "Shipped", body: `Order ${id} is on its way`, url: `/orders/${id}` })
    }
}
```

A person with no device turned on gets nothing, and the answer says so:

```quillo
print(notification.send("ann", { title: "Shipped", body: "On its way", url: "/orders/7" }))
print(notification.send(7, { title: "Back in stock", tag: "stock", badge: 3, ttl: "1h", urgency: "high" }))
```

```output
{ sent: 0, gone: 0 }
{ sent: 0, gone: 0 }
```

### Edge cases

- The person is compared as JSON: the int `7` and the text `"7"` are two people, so send
  what `session().user` holds.
- `tag`: a later message with the same tag takes its place on the device. `badge`: a
  whole number on the app's icon, where the system shows one; `0` takes it away.
  `silent: true`: no sound or vibration. `ttl`: how long a push service keeps it for a
  device that is away, seconds or a duration such as `"1h"`; a day when left out, four
  weeks at most. `urgency`: `"very-low"`, `"low"`, `"normal"` (the default) or `"high"`.
- It goes to 8 devices at a time over kept connections, each given 10 s and all of them
  30 s; the rest are said in the log as not sent. It waits as `http.post` does, the
  server going on meanwhile.
- A person has at most 20 devices in a program (and a tenant), the oldest replaced by a
  new one. A failure other than an ended subscription keeps it, and is said in the log.
- A `GET` that sends is refused as a [prefetch](/docs/prefetching/), and `quillo check`
  warns of one that sends and reads who the visitor is.
- In a component it is refused: a component runs in the browser too.
- To many people, send in a loop in a job, not in a visitor's request, which would wait
  for every send.
- The push key is derived from `QUILLO_SECRET`, the same on every instance. Without it,
  the key is made at start and a restart ends every subscription, which Quillo says as it
  starts.
- The subscriptions it reads are held to `--max-memory` as a query's rows are: past it,
  the request ends with a 500 that says the limit, as for any other value, and no `??`
  takes it. A request to `/_quillo/push` that meets the limit is a 500 that says it too
  *(since 0.8.8: the send gave an error value with the limit's words, which `??` took, and
  the request answered 200; `/_quillo/push` answered "internal error")*.

### Errors

A message over 3,800 bytes as sent (one push message) is an error value, and nothing is
sent; so is a send inside `db.transaction`, which would hold every other request while it
waits. A missing `title`, an option it does not have, a `url` that is not a path here, a
value of the wrong kind and no person are runtime errors that stop the request; `quillo
check` says the first two where the message is written out in the call.

```quillo
print(notification.send("ann", { title: "News", body: repeat("x", 4000) }))
```

```output
err("notification.send: the message is 4074 bytes as sent, more than the 3800 one push message holds: shorten its body")
```

```quillo error
print(notification.send("ann", { body: "no title" }))
```

```output
line 1: `notification.send` needs a `title`: the line the device shows first
```

```quillo error
print(notification.send("ann", { title: "Shipped", url: "https://evil.example/" }))
```

```output
line 1: `notification.send`'s `url` is a path on this site, like "/orders/7", got "https://evil.example/"
```

### See also

[notification.ask](/docs/reference/notification.ask/), [notification.user](/docs/reference/notification.user/), [notification.state](/docs/reference/notification.state/), [notification.stop](/docs/reference/notification.stop/), [notify](/docs/reference/notify/), [schedule](/docs/reference/schedule/), [publish](/docs/reference/publish/)
