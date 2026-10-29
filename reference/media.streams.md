# media.streams
media.streams() -> list
group: Media

### What it does

Every stream, by name: a list of `{ name, viewers, video: { frames, fps, kbps, lost },
audio: { frames, fps, kbps, lost } }`, sorted by name. `viewers` is this server's
pages watching; `fps` and `kbps` are the rate over the last while, and 0 after 3 s
without frames; `lost` counts packets that never came. A stream is one
[media.rtp](/docs/reference/media.rtp/) made, or one a page has sent a frame of.

### Examples

```quillo
media.rtp("cam", { video: 45004, audio: 45006 })
print(media.streams())
media.close("cam")
```

```output
[{ name: "cam", viewers: 0, video: { frames: 0, fps: 0, kbps: 0, lost: 0 }, audio: { frames: 0, fps: 0, kbps: 0, lost: 0 } }]
```

```quillo noexec
route GET /admin/streams = <table>
    {for s in media.streams() => <tr><td>{s.name}</td><td>{s.viewers}</td><td>{s.video.fps} fps</td></tr>}
</table>
```

### Edge cases

- With no stream, the list is empty.
- A closed stream is gone from the list at once.
- A stream with only an audio port has a `video` entry too, all zeros.
- The order is by name, however the streams were made.

```quillo
print(media.streams())
media.rtp("mic", { audio: 45008 })
media.rtp("cam", { video: 45004 })
print(media.streams() | map((s) => s.name))
print(media.streams() | first | get("video"))
print(media.close("cam"), media.close("mic"), media.streams())
```

```output
[]
["cam", "mic"]
{ frames: 0, fps: 0, kbps: 0, lost: 0 }
true true []
```

### Errors

It takes no arguments and cannot fail; there are no error values.

```quillo
print(media.streams() == [])
```

```output
true
```

### Chaining

The list pipes into `map`, `filter` and `find`, as any list does.

```quillo
media.rtp("cam", { video: 45004 })
print(media.streams() | find((s) => s.name == "cam") | get("viewers"))
print(media.streams() | filter((s) => s.viewers > 0) | len)
media.close("cam")
```

```output
0
0
```

### See also

[media.rtp](/docs/reference/media.rtp/), [media.close](/docs/reference/media.close/), [media.on](/docs/reference/media.on/), [channel.peers](/docs/reference/channel.peers/)
