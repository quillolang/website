# media.on
media.on(str, map | null=) -> null
group: Media

### What it does

Lets pages send and watch a stream: after `media.on(name, { publish, watch })`, a
page's `<quillo-media publish="name">` sends its camera and microphone (or another
MediaStream as its `source`) to the server, which passes the frames on to every
`<quillo-media stream="name">`, decoding nothing. A name ending in `*` takes every
stream it starts (`"call:*"`). `publish(peer)` says which pages may send, and
`watch(peer)` which may watch, as a channel's `join` does: with the page's session in
`peer.session`, anything but `null`, `false` or an error says yes. Without `publish`, no
page sends; without `watch`, no page watches *(since 0.7: any page could)*. Each tenant
has its own streams of a name; `tenants: "shared"` makes one for every tenant. It is
written at the top of a program, once for a name, and the program then serves.

### Examples

```quillo noexec
media.on("call:*", {
    publish: (peer) => peer.session.user != null,
    watch: (peer) => peer.session.user != null,
})

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
- A stream no `watch` names is watched by no page, an RTP stream of
  [media.rtp](/docs/reference/media.rtp/) too: `media.on("cam", { watch })` lets pages
  watch the camera.
- Pages on `acme.example.com` and `evil.example.com` sending `call:42` send two streams:
  acme's is not evil's. A tenant's page that watches a name it has no stream of watches
  the program's own RTP stream of that name. `tenants: "shared"` makes one stream for
  all; `"own"` is as with none.
- Pages make at most 1,024 streams, 256 a tenant, and a page watches at most 32 at once;
  a stream no page sends or watches any more goes.
- A stream keeps at most 32 MiB of video since its last keyframe, and all of them 256
  MiB; past that a stream keeps none, and a page that starts watching it waits for its
  next keyframe.

```quillo noexec
media.on("lobby")                                           // no page may send or watch "lobby"
media.on("desk:*", {
    publish: (peer) => peer.session.role == "agent",
    watch: (peer) => peer.session.user != null,
})
media.on("town-hall", {                                     // one stream for every tenant
    publish: (peer) => peer.session.role == "host",
    watch: (peer) => peer.session.user != null,
    tenants: "shared",
})
```

### Errors

A name that is not a string or not a stream name (letters, digits, `_`, `-`, `.` and
`:`, with `*` at the end allowed), a `publish` or `watch` that is not a function, a
`tenants` other than `"shared"` or `"own"`, an option that does not exist and a name
taken twice are runtime errors when the program starts.

```quillo error
media.on("call:*", { publish: true })
```

```output
line 1: `media.on`: `publish` is a function of the page that wants to send
```

```quillo error
media.on("call:*", { watch: true })
```

```output
line 1: `media.on`: `watch` is a function of the page that wants to watch
```

```quillo error
media.on("call:*", { join: (peer) => true })
```

```output
line 1: `media.on` has no option `join` (it takes publish, watch and tenants)
```

```quillo error
media.on("call:*", { tenants: "all" })
```

```output
line 1: `media.on`: `tenants` is "shared" (one room for every tenant) or "own", got "all"
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
media.on("hall", { watch: (peer) => peer.session.ticket != null })
media.on("questions:*", {
    publish: (peer) => peer.session.ticket != null,
    watch: (peer) => peer.session.ticket != null,
})
```

### See also

[media.rtp](/docs/reference/media.rtp/), [media.streams](/docs/reference/media.streams/), [media.close](/docs/reference/media.close/), [channel.on](/docs/reference/channel.on/), [session](/docs/reference/session/)
