# channel.on
channel.on(str, fn, map | null=) -> null
group: Channels

### What it does

Handles a channel on the server: written at the top of a program, once for a name,
it makes `f(msg, peer)` the function that gets each message a page sends on that
channel. `peer` is `{ id, session }`: twelve hex characters made for the page's
connection, and the page's session as it was when it connected. The options map takes
`join(peer)`, which decides whether a page may join (anything but `null`, `false` or an
error says yes), and `leave(peer)`, which hears that a page left. Each of the three is
called with as many arguments as it declares. The program then serves: a plain program
with `channel.on` in it does not end.

### Examples

```quillo noexec
channel.on("game", (msg, peer) => {
    // Everyone else in the channel sees the move.
    channel.broadcast("game", { id: peer.id, pos: msg.pos }, { except: peer })
})

channel.on("chat", (msg, peer) => {
    db.exec("insert into messages (who, text) values (?, ?)", peer.session.user, msg.text)
    channel.broadcast("chat", { who: peer.session.user, text: msg.text })
}, {
    join: (peer) => peer.session.user != null,
    leave: (peer) => channel.broadcast("chat", { left: peer.id }),
})
```

### Edge cases

- A name is letters, digits, `_`, `-`, `.` and `:`, at most 64 characters; two
  `channel.on` for one name is an error.
- Messages reach `f` in the order they came, one at a time; an error in `f` is logged
  and the next message goes on. `f` may wait on the database or `http.*` without
  holding anyone else up.
- A channel no `channel.on` names can still be joined, to hear what the program
  broadcasts on it; what pages send on it goes nowhere.
- Without `join`, anyone who can open a page may join; a channel whose messages are not
  for everyone has one.
- `session()` inside `f` is the page's session as it was when the page connected: a
  visitor who signs in afterwards is seen so once the page reconnects.
- What `join` broadcasts, or sends to the page that is joining, reaches that page right
  after its yes.

```quillo noexec
channel.on("room:7.lobby", (msg, peer) => channel.send("room:7.lobby", peer, { echo: msg }))
channel.on("ticks", (msg) => print(msg))        // f declared with one parameter gets one
```

### Errors

A bad name, a second argument that is not a function, a `join` or `leave` that is not
one, an option that does not exist, and a name handled twice are runtime errors when
the program starts, so the program does not serve. There are no error values.

```quillo error
channel.on("bad name!", (msg) => msg)
```

```output
line 1: `channel.on`: a channel's name is letters, digits, `_`, `-`, `.` and `:`, up to 64, got "bad name!"
```

```quillo error
channel.on("game", (msg) => msg)
channel.on("game", (msg) => msg)
```

```output
line 2: `channel.on`: the program already handles channel "game"
```

```quillo error
channel.on("game", (msg) => msg, { join: true })
```

```output
line 1: `channel.on`: `join` is a function of the page
```

### Chaining

`channel.on` gives null and is not piped. Inside `f`, the other channel functions
answer: [channel.send](/docs/reference/channel.send/) to the page that wrote,
[channel.broadcast](/docs/reference/channel.broadcast/) to all, and
[channel.peers](/docs/reference/channel.peers/) to see who is there.

```quillo noexec
channel.on("poll", (msg, peer) => {
    let n = channel.peers("poll") | len
    channel.send("poll", peer, { you_and: n - 1, others: n - 1 })
})
```

### See also

[channel.open](/docs/reference/channel.open/), [channel.send](/docs/reference/channel.send/), [channel.broadcast](/docs/reference/channel.broadcast/), [channel.peers](/docs/reference/channel.peers/), [session](/docs/reference/session/), [udp.listen](/docs/reference/udp.listen/)
