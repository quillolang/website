# image.info
image.info(str) -> map | error(str)
group: Media

### What it does

The size and kind of an image file, from its header alone: `{ width, height, format,
alpha }`, with `format` one of `jpeg`, `png`, `webp` and `gif`. The pixels are not
decoded, so it is a cheap check that an upload is an image at all. The path is inside
the program's folder. A file that is missing or not an image is an error value. It
needs the `fs` effect.

### Examples

```quillo noexec
let info = image.info("photos/a.jpg")           // { width: 4032, height: 3024, format: "jpeg", alpha: false }
if info.width > 800 { image.convert("photos/a.jpg", "cache/a-800.jpg", { width: 800 }) }
```

A one-pixel GIF, written as text since every byte of it is below 128:

```quillo
write_file("tiny.gif", "GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000,\u0000\u0000\u0000\u0000\u0001\u0000\u0001\u0000\u0000\u0002\u0002D\u0001\u0000;")
print(image.info("tiny.gif"))
print(image.info("tiny.gif").width)
delete_file("tiny.gif")
```

```output
{ width: 1, height: 1, format: "gif", alpha: true }
1
```

### Edge cases

- A file that is not there is an error value, as is one that is not a JPEG, PNG, WebP
  or GIF: a `.png` that holds text, for instance.
- An image claiming more than 12,000 pixels a side is an error value, before anything
  is allocated.
- The format comes from the bytes, not the file's name.
- A GIF is reported with `alpha` true.

```quillo
print(image.info("nothing.png"))
print(image.info("main.qwe"))
write_file("photo.png", "GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000,\u0000\u0000\u0000\u0000\u0001\u0000\u0001\u0000\u0000\u0002\u0002D\u0001\u0000;")
print(image.info("photo.png").format)
delete_file("photo.png")
```

```output
err("image: No such file or directory (os error 2)")
err("image: not a JPEG, PNG, WebP or GIF image")
gif
```

### Errors

A missing or unreadable image is an error value: check with `is_err`, give a default
with `??`, or pass it on with `?`. A path outside the program's folder, or one that is
not a string, is a runtime error.

```quillo
let r = image.info("nothing.png")
print(is_err(r), r.error)
print(image.info("nothing.png") ?? { width: 0, height: 0 })
```

```output
true image: No such file or directory (os error 2)
{ width: 0, height: 0 }
```

```quillo error
print(image.info("../secret.png"))
```

```output
line 1: `image.info`: "../secret.png" is not a path inside the program's folder
```

### Chaining

The path is its only argument, so it pipes in; `?` in a route turns a bad upload into
the request's answer.

```quillo noexec
route POST /avatar { files: { photo } } {
    let path = save_upload(photo, "uploads")
    let info = image.info(path) ?? reply 400 "not an image"
    image.convert(path, `avatars/${session().user}.jpg`, { width: 256 })?
    redirect("/me")
}
```

```quillo
print(["a.png", "b.png"] | map(image.info) | map(is_err))
```

```output
[true, true]
```

### See also

[image.convert](/docs/reference/image.convert/), [save_upload](/docs/reference/save_upload/), [write_file](/docs/reference/write_file/), [is_err](/docs/reference/is_err/)
