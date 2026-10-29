# channel.send
channel.send(str, map | str, any, map | null=) -> bool
group: Channels

### What it does

Sends a value to one page in a channel: the channel's name, the peer (the map the
channel's function gets, or its id), the value, and options. It gives whether the page
was there to take it. The value goes as JSON, up to 1 MiB; `{ reliable: true }` makes
sure it arrives in order (over a stream rather than a datagram), and closes a page's
connection that cannot keep up rather than drop it. It waits for nothing and needs the
`net` effect.

### Examples

```quillo noexec
channel.on("game", (msg, peer) => {
    if msg.kind == "hello" {
        channel.send("game", peer, { you: peer.id, board: board() }, { reliable: true })
    }
})
```

With no page in the channel, the answer is false:

```quillo
print(channel.send("game", "0123456789ab", { pos: [1, 2] }))
print(channel.send("game", { id: "0123456789ab", session: {} }, "hi", { reliable: true }))
```

```output
false
false
```

### Edge cases

- A peer that has gone, or that is in another channel, gives false; nothing is kept
  for a page that is away.
- A page that is being let in (its `join` said yes but the yes has not reached it)
  gets the message right after its yes.
- The value may be `null`, text, a number, a map or a list; bytes go as a list of
  numbers.
- Over 4096 messages waiting for one page, a plain message is dropped and counted; a
  `reliable` one closes the connection, so the page comes back and joins again.
- `except` is an option of `channel.broadcast`, not of `channel.send`.

```quillo
print(channel.send("game", "0123456789ab", null))
print(channel.send("game", "0123456789ab", [1, 2, 3]))
print(channel.send("room:1.a-b_c", "0123456789ab", "text"))
```

```output
false
false
false
```

### Errors

A bad channel name, a peer that is neither a peer map nor a hex id, an option that does
not exist, and a message over 1 MiB as JSON are runtime errors. A page that is not there
is not an error: the result is false.

```quillo error
print(channel.send("game", 42, "hi"))
```

```output
line 1: `channel.send` takes a peer (as the channel's function gets it, or its id) second
```

```quillo error
print(channel.send("game", "0123456789ab", "hi", { except: "0123456789ab" }))
```

```output
line 1: `channel.send` has no option `except`
```

### Chaining

The name comes first, so a pipeline passes it; the bool answers whether to try another
way.

```quillo noexec
channel.on("orders", (msg, peer) => {
    if !channel.send("orders", peer, { accepted: msg.id }) {
        db.exec("update orders set notify = 1 where id = ?", msg.id)   // tell them next time
    }
})
```

```quillo
print("game" | channel.send("0123456789ab", "hi"))
```

```output
false
```

### See also

[channel.broadcast](/docs/reference/channel.broadcast/), [channel.on](/docs/reference/channel.on/), [channel.peers](/docs/reference/channel.peers/), [channel.open](/docs/reference/channel.open/)
