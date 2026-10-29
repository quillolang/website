# channel.peers
channel.peers(str) -> list
group: Channels

### What it does

The ids of the pages in a channel, as a list of twelve-character hex strings, in a
fixed order. An id names a page's connection (a page that reconnects has a new one)
and is what [channel.send](/docs/reference/channel.send/) takes. This is the only list of
who is present: what a `join` or `leave` handler records is the rest.

### Examples

```quillo noexec
channel.on("chat", (msg, peer) => {
    for id in channel.peers("chat") {
        if id != peer.id { channel.send("chat", id, { from: peer.id, text: msg.text }) }
    }
})
```

With no page there, the list is empty:

```quillo
print(channel.peers("game"))
print(len(channel.peers("game")))
```

```output
[]
0
```

### Edge cases

- A channel nobody joined, and one no `channel.on` handles, give `[]`, not an error.
- The ids are connections, not people: one visitor with two tabs is two ids, and a
  reconnected page a new one.
- The list is of this server's pages: behind a balancer, another server's pages are
  not in it.

```quillo
print(channel.peers("nobody-here"))
print(channel.peers("room:1.a-b_c") == [])
```

```output
[]
true
```

### Errors

A name that is not a string, or not a channel name (letters, digits, `_`, `-`, `.`
and `:`, at most 64 characters), is a runtime error.

```quillo error
print(channel.peers())
```

```output
line 1: `channel.peers` takes a channel's name first, got nothing
```

```quillo error
print(channel.peers("bad name"))
```

```output
line 1: `channel.peers`: a channel's name is letters, digits, `_`, `-`, `.` and `:`, up to 64, got "bad name"
```

### Chaining

The name is its only argument, so `name | channel.peers | len` counts the pages, and
`map` sends to each.

```quillo
print("game" | channel.peers | len)
print(channel.peers("game") | map((id) => channel.send("game", id, "hi")))
```

```output
0
[]
```

### See also

[channel.send](/docs/reference/channel.send/), [channel.broadcast](/docs/reference/channel.broadcast/), [channel.on](/docs/reference/channel.on/), [len](/docs/reference/len/)
