# media.close
media.close(str) -> bool
group: Media

### What it does

Ends a stream by name: it stops taking RTP, lets its ports go (waiting up to a second
for that, so another stream can take them at once), stops taking frames from pages
sending it, and tells the pages watching, whose `<quillo-media>` turns `data-state`
`ended`. It gives true if there was such a stream, false otherwise.

### Examples

```quillo
media.rtp("cam", { video: 45004 })
print(media.close("cam"))
print(media.close("cam"))
```

```output
true
false
```

```quillo noexec
route POST /rooms/:id/end {
    media.close(`room:${id}`)
    redirect("/rooms")
}
```

### Edge cases

- Closing a name that is not a stream, or one closed already, gives false, not an
  error.
- The ports are free again: a stream of another name may take them right after.
- A page that was watching stays `ended` until it reconnects, even if a stream of that
  name is made again.
- The stream's name is not checked for its letters: any string asks, and an unknown one
  is false.

```quillo
print(media.close("never-made"))
media.rtp("a", { video: 45004 })
print(media.close("a"))
media.rtp("b", { video: 45004 })
print(media.close("b"), media.close("a"))
print(media.close("not a name!"))
```

```output
false
true
true false
false
```

### Errors

A name that is not a string, or no argument, is a runtime error. There are no error
values.

```quillo error
print(media.close(1))
```

```output
line 1: `media.close` takes a stream's name, got 1
```

### Chaining

The name is its only argument, so a list of names can be closed with `map`; the bool
says which were there.

```quillo
media.rtp("x", { video: 45004 })
media.rtp("y", { video: 45006 })
print(["x", "y", "z"] | map(media.close))
print(media.streams())
```

```output
[true, true, false]
[]
```

### See also

[media.rtp](/docs/reference/media.rtp/), [media.streams](/docs/reference/media.streams/), [media.on](/docs/reference/media.on/)
