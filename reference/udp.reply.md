# udp.reply
udp.reply(map, any) -> null | error(str)
group: UDP

### What it does

Sends a packet back to where one came from: given the packet map that
[udp.listen](/docs/reference/udp.listen/) handed to its function, it sends to
`packet.from` from the port the packet came to, `packet.port`, as most protocols expect
the answer. The data is as [udp.send](/docs/reference/udp.send/) takes it: text, a list
of byte values, or any other value as JSON, up to 65,507 bytes. It gives `null`, or an
error value when the system refuses the packet. It needs the `net` effect.

### Examples

```quillo noexec
udp.listen(9000, (p) => {
    let cmd = json.parse(p.text)
    match cmd.op {
        "ping" => udp.reply(p, "pong"),
        "get" => udp.reply(p, { value: state[cmd.key] }),
        _ => udp.reply(p, { error: "unknown op" }),
    }
})
```

### Edge cases

- The answer leaves from the port the packet came to, not from a port of the system's
  choosing, so a sender that waits on the port it sent to hears it.
- A packet's map can be kept and answered later, from another request or a schedule,
  as long as the program still listens on its port.
- The sender may be gone: the packet is sent all the same and the result is `null`,
  since UDP has no way to know.
- The map must have `port` and `from: { host, port }`; a map made by hand with those
  fields is accepted, as long as the program listens on `port`.

```quillo noexec
udp.listen(9000, (p) => {
    channel.broadcast("readings", p.text)
    udp.reply(p, [6])                          // one byte: ACK
})
```

### Errors

A first argument that is not a packet map (no `port`, no `from`), `null` data, data
over 65,507 bytes, and a packet whose `port` the program does not listen on are runtime
errors; the last is what a packet map made by hand in a program without
`udp.listen` meets. A refused send is an error value.

```quillo error
print(udp.reply({}, "x"))
```

```output
line 1: `udp.reply` takes a packet that `udp.listen` gave, then what to send
```

```quillo error
let packet = { text: "hi", bytes: [104, 105], from: { host: "127.0.0.1", port: 5000 }, port: 9000, at: now() }
print(udp.reply(packet, "ok"))
```

```output
line 2: `udp.reply`: the program does not listen on UDP port 9000
```

### Chaining

The packet comes first, so inside the handler `p | udp.reply("ok")` reads as an
answer; the result is `null` or an error, so `??` ignores a failure and `is_err`
sees it.

```quillo noexec
udp.listen(9000, (p) => {
    let r = p | udp.reply("ok")
    if is_err(r) { print("could not answer", p.from.host, r.error) }
})
```

### See also

[udp.listen](/docs/reference/udp.listen/), [udp.send](/docs/reference/udp.send/), [json.parse](/docs/reference/json.parse/), [is_err](/docs/reference/is_err/)
