# udp.listen
udp.listen(int, fn, map | null=) -> null
group: UDP

### What it does

Takes UDP packets on a port: written at the top of a program, it binds the port when
the program starts and calls `f` with each packet, `{ text, bytes, from: { host, port },
port, at }`. `text` is the packet as text, or `null` when it is not UTF-8; `bytes` its
bytes as a list of numbers; `at` when it came, in milliseconds since 1970. The options
are `host`, the address to listen on (every IPv4 address, `"0.0.0.0"`, unless given;
`"::"` for IPv6 as well) and `queue`, how many packets wait while `f` is busy (10,000
unless given). The program then serves: a plain program with `udp.listen` in it does
not end.

### Examples

```quillo noexec
let readings = []

udp.listen(9000, (p) => {
    readings = readings + [json.parse(p.text)]   // pages with live(...) on it follow
    udp.reply(p, "ok")                           // sent back from port 9000
})

udp.listen(514, (p) => db.exec("insert into syslog (host, line) values (?, ?)", p.from.host, p.text), {
    host: "10.0.0.2",
    queue: 50000,
})
```

### Edge cases

- The port is taken when the program runs, so one that is in use, or on an address
  the machine does not have, is an error at once.
- Packets reach `f` in the order they came, one at a time; an error in `f` is logged
  and the next packet goes on. `f` may wait on the database or `http.*` without holding
  anyone up, and sees the program's globals.
- A full queue drops its oldest packet, as UDP would; where packets come in bursts,
  give `queue` room for the largest.
- `f` written with no parameter is called with none.
- One program on a machine listens on a port; with `--instances`, the instances share
  the socket. With `--reload`, a port still listened on stays open across the reload.
- There is no multicast, and packets are plain: no DTLS.

```quillo noexec
udp.listen(9000, () => print("a packet"))
udp.listen(9001, (p) => print(p.text ?? `${len(p.bytes)} bytes, not text`))
```

### Errors

A port outside 1 to 65535, a second argument that is not a function, a bad `host` or
`queue`, an option that does not exist, a port the program already listens on and a
port that cannot be bound are runtime errors when the program starts, so it does not
serve. There are no error values.

```quillo error
udp.listen(0, (p) => p)
```

```output
line 1: `udp.listen` takes a port from 1 to 65535 first, got 0
```

```quillo error
udp.listen(9000, (p) => p)
udp.listen(9000, (p) => p)
```

```output
line 2: `udp.listen`: the program already listens on UDP port 9000
```

```quillo error
udp.listen(9000, (p) => p, { queue: 0 })
```

```output
line 1: `udp.listen`: `queue` is a number of packets above 0
```

### Chaining

It gives null and is not piped. In `f`, [udp.reply](/docs/reference/udp.reply/) answers
the sender, and [channel.broadcast](/docs/reference/channel.broadcast/) or a global that
pages follow with [live](/docs/reference/live/) passes the packet on.

```quillo noexec
udp.listen(9000, (p) => {
    let reading = json.parse(p.text) ?? reply_bad(p)
    channel.broadcast("telemetry", { from: p.from.host, at: p.at, ...reading })
})
```

### See also

[udp.reply](/docs/reference/udp.reply/), [udp.send](/docs/reference/udp.send/), [channel.on](/docs/reference/channel.on/), [live](/docs/reference/live/), [json.parse](/docs/reference/json.parse/)
