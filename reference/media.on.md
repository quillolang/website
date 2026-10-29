# media.on
media.on(str, map | null=) -> null
group: Media

### What it does

Lets pages send a stream: after `media.on(name, { publish })`, a page's
`<quillo-media publish="name">` sends its camera and microphone (or another
MediaStream as its `source`) to the server, which passes the frames on to every
`<quillo-media stream="name">`, decoding nothing. A name ending in `*` takes every
stream it starts (`"call:*"`). `publish(peer)` says which pages may, as a channel's
`join` does: with the page's session in `peer.session`, anything but `null`, `false` or
an error says yes; without it, any page may. It is written at the top of a program,
once for a name, and the program then serves.

### Examples

```quillo noexec
media.on("call:*", { publish: (peer) => peer.session.user != null })

component Call(room: str, me: str, others: list) {
    <div>
        <quillo-media publish={`call:${room}:${me}`}/>
        {for p in others => <quillo-media key={p} stream={`call:${room}:${p}`}/>}
    </div>
}
```

### Edge cases

- The browser encodes with WebCodecs: H.264 baseline at 1280x720, 30 frames a second
  and 1.5 Mbit/s with a keyframe every two seconds, and Opus at 64 kbit/s. Sound needs
  Chromium's capture API; a browser without it sends the picture alone.
- `no-video` or `no-audio` on the element leaves one out; `el.source` set in `@mount`
  (a canvas's stream, the screen's) is sent instead of the camera.
- Each person's picture goes once to the server, which sends it on to everyone
  watching; there is no TURN relay, and where UDP is blocked the WebSocket carries it.
- A stream pages send is listed by [media.streams](/docs/reference/media.streams/) once a
  frame has come, and [media.close](/docs/reference/media.close/) ends it.
- The element's `data-state` is `starting`, `sending`, `refused` (no camera, or
  `publish` said no), `ended` or `unsupported`.

```quillo noexec
media.on("lobby")                                           // anyone may send "lobby"
media.on("desk:*", { publish: (peer) => peer.session.role == "agent" })
```

### Errors

A name that is not a string or not a stream name (letters, digits, `_`, `-`, `.` and
`:`, with `*` at the end allowed), a `publish` that is not a function, an option that
does not exist and a name taken twice are runtime errors when the program starts.

```quillo error
media.on("call:*", { publish: true })
```

```output
line 1: `media.on`: `publish` is a function of the page that wants to send
```

```quillo error
media.on("x")
media.on("x")
```

```output
line 2: `media.on`: the program already takes stream "x" from pages
```

```quillo error
media.on("bad name*")
```

```output
line 1: `media.on` takes a stream's name first (or one ending in `*`), got "bad name*"
```

### Chaining

It gives null and is not piped. With [media.rtp](/docs/reference/media.rtp/) for the
camera's side and `media.on` for the pages', one page shows both.

```quillo noexec
media.rtp("hall", { video: 5004, audio: 5006 })
media.on("questions:*", { publish: (peer) => peer.session.ticket != null })
```

### See also

[media.rtp](/docs/reference/media.rtp/), [media.streams](/docs/reference/media.streams/), [media.close](/docs/reference/media.close/), [channel.on](/docs/reference/channel.on/), [session](/docs/reference/session/)
