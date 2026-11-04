# channel.broadcast
channel.broadcast(str, any, map | null=) -> int
group: Channels

### What it does

Sends a value to every page in a channel and gives how many took it. The value goes as
JSON, up to 1 MiB. The options are `except` (a peer, or its id, that is left out:
usually the one whose message is being passed on) and `reliable` (in order, over a
stream; a page that cannot keep up is disconnected rather than miss it). It waits for
nothing, needs the `net` effect, and reaches the pages connected to this server (and the
copies of it that `quillo run main.qwe --instances 4` starts; see [the options](/docs/)).
Each tenant has its own room *(since 0.7)*: code run for a page or a request reaches its
tenant's room (a page with no tenant, the room of no tenant), and a job, a tick and the
top level reach every tenant's. `with_tenant(name, f)` reaches one tenant's.

### Examples

```quillo noexec
channel.on("game", (msg, peer) => {
    channel.broadcast("game", { id: peer.id, pos: msg.pos }, { except: peer })
})

schedule("*/10 * * * * *", () => channel.broadcast("ticks", { at: now() }))
```

With no page in the channel, nothing is sent and the count is 0:

```quillo
print(channel.broadcast("game", { pos: [1, 2] }))
print(channel.broadcast("game", "text", { reliable: true, except: "0123456789ab" }))
```

```output
0
0
```

### Edge cases

- A channel nobody has joined gives 0, and so does a name no `channel.on` handles: a
  page may join such a channel only to listen.
- The count is of pages that took the message; one whose queue (4096) is full is not
  counted.
- Pages that are being let in get the message right after their yes.
- `null` is a message like any other.
- A page that joins later hears nothing of what went before: a roster or a state is
  sent again on `join`.
- A channel made with `tenants: "shared"` (see [channel.on](/docs/reference/channel.on/))
  has one room, which every tenant's code reaches.

```quillo
print(channel.broadcast("nobody-here", null))
print(channel.broadcast("room:1.a-b_c", [1, 2, 3]))
```

```output
0
0
```

### Errors

A bad name, an option that does not exist, options that are not a map and a message
over 1 MiB as JSON are runtime errors, not error values.

```quillo error
print(channel.broadcast("game", 1, { foo: 1 }))
```

```output
line 1: `channel.broadcast` has no option `foo`
```

```quillo error
print(channel.broadcast("game", repeat("x", 1100000)))
```

```output
line 1: `channel.broadcast`: the message is 1100015 bytes as JSON; at most 1048576 go to a page
```

### Chaining

The name comes first in a pipeline. The count can be logged or compared with
[channel.peers](/docs/reference/channel.peers/).

```quillo noexec
route POST /notice { form: { text: str } } {
    let n = channel.broadcast("notices", { text }, { reliable: true })   // this tenant's pages
    `sent to ${n} pages`
}

schedule("0 9 * * *", () => {
    channel.broadcast("notices", { text: "good morning" })                // every tenant's
    with_tenant("acme", () => channel.broadcast("notices", { text: "acme only" }))
})
```

```quillo
print("game" | channel.broadcast({ tick: 1 }))
```

```output
0
```

### See also

[channel.send](/docs/reference/channel.send/), [channel.peers](/docs/reference/channel.peers/), [channel.on](/docs/reference/channel.on/), [channel.open](/docs/reference/channel.open/), [schedule](/docs/reference/schedule/), [with_tenant](/docs/reference/with_tenant/)
