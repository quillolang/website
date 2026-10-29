# udp.send
udp.send(str, int, any, map | null=) -> null | error(str)
group: UDP

### What it does

Sends one UDP packet to a host and port: text as its bytes, a list of byte values
(0 to 255) as those bytes, any other value as JSON. A packet holds up to 65,507 bytes.
It gives `null` when the packet was handed to the system, and an error value when the
host has no address or the system refuses the packet; UDP never says whether the packet
arrived. `{ from: port }` sends from a port the program listens on, so an answer comes
back there. It needs the `net` effect.

### Examples

```quillo
print(udp.send("127.0.0.1", 9, "<14>app started"))
print(udp.send("127.0.0.1", 9, [1, 2, 255]))
print(udp.send("127.0.0.1", 9, { reading: 21.5, unit: "C" }))
```

```output
null
null
null
```

```quillo noexec
udp.listen(9000, (p) => print(p.text))
udp.send("10.0.0.5", 9000, "hello", { from: 9000 })     // the answer comes to port 9000
```

### Edge cases

- A host may be a name; it is looked up, over IPv4 when it has both kinds of address.
  A name with no address is an error value, not a runtime error.
- An IPv6 address works (`"::1"`); a sending port is chosen by the system unless
  `from` says otherwise.
- A list that is not all whole numbers 0 to 255, or is empty, goes as JSON
  (`[1, 256]` is sent as the text `[1,256]`); the empty string sends an empty packet.
- A number goes as JSON too: `42` sends the text `42`.
- The packet reaching nobody (a port nothing listens on) is still `null`: there is no
  answer to wait for.

```quillo
print(udp.send("localhost", 9, "named host"))
print(udp.send("::1", 9, "v6"))
print(udp.send("127.0.0.1", 9, []), udp.send("127.0.0.1", 9, ""), udp.send("127.0.0.1", 9, 42))
print(udp.send("not a host", 514, "x"))
```

```output
null
null
null null null
err("cannot find the address of not a host")
```

### Errors

A host with no address, or a packet the system refuses, is an error value: check it
with `is_err` or replace it with `??`. A host that is not a string, a port outside 1
to 65535, `null` data, more than 65,507 bytes, and a `from` port the program does not
listen on are runtime errors.

```quillo
let r = udp.send("not a host", 514, "x")
print(is_err(r), r.error)
print(udp.send("not a host", 514, "x") ?? "not sent")
```

```output
true cannot find the address of not a host
not sent
```

```quillo error
print(udp.send("127.0.0.1", 9, null))
```

```output
line 1: `udp.send` has nothing to send
```

```quillo error
print(udp.send("127.0.0.1", 9, repeat("x", 65508)))
```

```output
line 1: `udp.send`: 65508 bytes is more than a UDP packet holds (65507)
```

```quillo error
print(udp.send("127.0.0.1", 9, "x", { from: 9999 }))
```

```output
line 1: `udp.send`: the program does not listen on UDP port 9999
```

### Chaining

The host comes first, so a pipeline passes it; the data is written in the call. The
result is `null` or an error, so `?` passes a failure on and `??` ignores it.

```quillo
print(["127.0.0.1", "::1"] | map((h) => udp.send(h, 9, "ping")))
print("127.0.0.1" | udp.send(9, "piped"))
```

```output
[null, null]
null
```

### See also

[udp.reply](/docs/reference/udp.reply/), [udp.listen](/docs/reference/udp.listen/), [json.stringify](/docs/reference/json.stringify/), [is_err](/docs/reference/is_err/)
