# channel.open
channel.open(str, fn, map | null=) -> map
group: Channels

### What it does

Opens a channel from a page: in a component, `channel.open(name, f)` joins the
channel for as long as the code that called it stands (the component leaving the page
closes it). `f` gets each message the server sends on the channel, and the map it gives
has `.send(value, { reliable })`, which sends one to the server's
[channel.on](/docs/reference/channel.on/) handler and gives `null`. On the server, while
the page is rendered, it opens nothing: the map's `send` gives `false`.

### Examples

```quillo noexec
component Board() {
    state others = {}
    let game = channel.open("game", (m) => { others = set(others, m.id, m.pos) })
    <canvas @pointermove={(e) => game.send({ pos: [e.clientX, e.clientY] })}/>
}

component Chat() {
    state lines = []
    let chat = channel.open("chat", (m) => { lines = lines + [m] })
    <form @submit={(e) => chat.send({ text: e.form.text }, { reliable: true })}>
        <input name="text"/>
    </form>
}
```

What the server sees while rendering:

```quillo
let game = channel.open("game", (m) => print(m))
print(game)
print(game.send({ pos: [1, 2] }))
```

```output
{ send: <builtin channel.open.send> }
false
```

### Edge cases

- A page opens one connection for all its channels: WebTransport where the browser
  has it, else a WebSocket, opened again when it drops (after half a second, then
  longer, up to 15 s), with the channels joined again.
- Messages sent before the join is answered, or while the connection is down, wait (up
  to 256 a channel) and go once it is joined; on a channel that refused the page, they
  are dropped.
- Over WebTransport, a small message (about 1,100 bytes as JSON) goes as a datagram:
  it may come out of order or be lost, as a game's moves can afford; `{ reliable: true
  }` or a larger message goes in order, on a stream.
- A name no `channel.on` handles can be opened, to hear the program's broadcasts; what
  the page sends on it goes nowhere.
- The name must be a channel name: letters, digits, `_`, `-`, `.` and `:`, at most 64
  characters, checked on the server too.

```quillo
print(channel.open("room:1.a-b_c", (m) => m).send(null))
```

```output
false
```

### Errors

A bad name is a runtime error, on the server as in the page. There are no error values:
a message that cannot be delivered is dropped or waits, as above.

```quillo error
print(channel.open("bad name", (m) => m))
```

```output
line 1: `channel.open`: a channel's name is letters, digits, `_`, `-`, `.` and `:`, up to 64, got "bad name"
```

### Chaining

The map is kept in a `let` and its `send` called from handlers; the name comes first,
so it could be piped, but it is written out.

```quillo noexec
component Cursor() {
    let c = channel.open("cursors", (m) => draw(m))
    <div @pointermove={(e) => c.send([e.clientX, e.clientY])}/>
}
```

```quillo
print("game" | channel.open((m) => m) | keys)
```

```output
["send"]
```

### See also

[channel.on](/docs/reference/channel.on/), [channel.send](/docs/reference/channel.send/), [channel.broadcast](/docs/reference/channel.broadcast/), [listen](/docs/reference/listen/), [live](/docs/reference/live/)
