# media.rtp
media.rtp(str, map) -> null
group: Media

### What it does

Makes a stream that takes a camera's or an encoder's RTP on UDP ports, for pages to
play with `<quillo-media stream="name">`: `{ video: port, audio: port, host }`, one or
both tracks, each on a port of its own. Video is H.264 and audio Opus, the only codecs
taken (`{ port: 5004, codec: "h264" }` says so in full). The server puts the packets
in order, makes frames of them and passes each on to every page watching, decoding
nothing; Quillo code never sees the packets. It is written at the top of a program or
while it runs (a stream for each room), once for a name: asked again, it is the same
stream.

### Examples

```quillo noexec
media.rtp("cam", { video: 5004, audio: 5006 })

route GET / = <html><body><quillo-media stream="cam" controls muted/></body></html>
```

```sh
ffmpeg -f avfoundation -framerate 30 -video_size 1280x720 -i "0:0" \
  -map 0:v -c:v libx264 -tune zerolatency -profile:v baseline -pix_fmt yuv420p -g 60 \
  -f rtp rtp://127.0.0.1:5004 -map 0:a -c:a libopus -f rtp rtp://127.0.0.1:5006
```

The ports are taken as soon as it is called, and the stream is listed at once:

```quillo
print(media.rtp("cam", { video: 45004, audio: 45006 }))
print(media.streams() | map((s) => s.name))
print(media.close("cam"))
```

```output
null
["cam"]
true
```

### Edge cases

- A name is as a channel's: letters, digits, `_`, `-`, `.` and `:`.
- Calling it again with the same name gives the same stream, not an error.
- `host` is the address to listen on, every IPv4 address unless given; one this
  machine does not have is a runtime error.
- Any sender that reaches the port is taken (the payload type and SSRC are not
  checked), and there is no RTCP and no SRTP: keep the ports to the camera's network.
- The server keeps the video since the last keyframe (at most 600 frames), so a page
  that starts watching shows a picture at once; a page that falls behind, or a lost
  packet of video, skips to the next keyframe.
- A late packet is waited for 50 ms, or 256 packets.

```quillo
print(media.rtp("mic", { audio: { port: 45008, codec: "opus" }, host: "127.0.0.1" }))
print(media.rtp("mic", { audio: { port: 45008, codec: "opus" }, host: "127.0.0.1" }))
print(media.streams())
print(media.close("mic"))
```

```output
null
null
[{ name: "mic", viewers: 0, video: { frames: 0, fps: 0, kbps: 0, lost: 0 }, audio: { frames: 0, fps: 0, kbps: 0, lost: 0 } }]
true
```

### Errors

A bad name, no ports map, neither track, a port out of range, a codec other than
h264 for video or opus for audio, an option that does not exist, and a port that cannot
be listened on are runtime errors, not error values.

```quillo error
media.rtp("cam", { video: { port: 45004, codec: "vp8" } })
```

```output
line 1: `media.rtp`: vp8 in video is not supported (h264 is)
```

```quillo error
media.rtp("cam", {})
```

```output
line 1: `media.rtp` needs a video port, an audio port, or both
```

```quillo error
media.rtp("cam", { video: 45004, host: "203.0.113.1" })
```

```output
line 1: `media.rtp`: cannot listen on UDP port 45004: Can't assign requested address (os error 49)
```

### Chaining

It gives null and is not piped. [media.streams](/docs/reference/media.streams/) shows
what it made, and [media.close](/docs/reference/media.close/) ends it.

```quillo noexec
route POST /rooms { form: { name: str } } {
    let id = db.exec("insert into rooms (name) values (?)", name).last_id
    media.rtp(`room:${id}`, { video: 5000 + id * 2, audio: 5001 + id * 2 })
    redirect(`/rooms/${id}`)
}
```

```quillo
media.rtp("a", { video: 45010 })
print(media.streams() | map((s) => s.name), media.close("a"))
```

```output
["a"] true
```

### See also

[media.streams](/docs/reference/media.streams/), [media.close](/docs/reference/media.close/), [media.on](/docs/reference/media.on/), [udp.listen](/docs/reference/udp.listen/)
