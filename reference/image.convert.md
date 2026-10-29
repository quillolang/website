# image.convert
image.convert(str, str, map | null=) -> map | error(str)
group: Media

### What it does

Reads an image (JPEG, PNG, WebP or GIF), crops it, shrinks it and writes it as another
file: `{ crop: { x, y, w, h }, width, format, quality }`, giving `{ width, height }` of
what was written. `crop` is in the image's pixels; `width` shrinks to that width,
keeping the shape, and never enlarges; `format` is `jpeg` (the default), `png` or
`webp` (lossless); `quality` is the JPEG's, 82 unless given. The file is written whole
or not at all, folders on the way are made, and both paths stay inside the program's
folder. At most four conversions run at once; past 64 waiting, it gives an error value
at once. It needs the `fs` effect.

### Examples

```quillo noexec
image.convert("photos/a.jpg", "cache/a-800.jpg", {
    crop: { x: 100, y: 0, w: 1200, h: 675 },   // in the image's pixels
    width: 800,                                 // shrunk to it, never enlarged
    format: "jpeg", quality: 82,                // jpeg, png or webp (lossless)
})
image.convert(path, "thumbs/42.webp", { width: 160, format: "webp" })
```

A source that cannot be decoded is an error value, and nothing is written:

```quillo
print(image.convert("nothing.jpg", "out.jpg", { width: 100 }))
print(image.convert("main.qwe", "out.jpg"))
```

```output
err("image: No such file or directory (os error 2)")
err("image: not a JPEG, PNG, WebP or GIF image")
```

### Edge cases

- A `width` larger than the image leaves the size as it is.
- A crop that reaches outside the image is an error value naming both sizes.
- The destination's folder is made when missing; an existing file is replaced.
- The format is what `format` says, whatever the destination's name ends in.
- A file that reads as an image but cannot be decoded (a GIF with no colour table,
  here) is an error value from the decoder.

```quillo
write_file("tiny.gif", "GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000,\u0000\u0000\u0000\u0000\u0001\u0000\u0001\u0000\u0000\u0002\u0002D\u0001\u0000;")
print(image.info("tiny.gif"))
print(image.convert("tiny.gif", "out/tiny.png", { format: "png" }))
print(image.info("out/tiny.png"))
delete_file("tiny.gif")
```

```output
{ width: 1, height: 1, format: "gif", alpha: true }
err("image: Format error decoding Gif: no color table available for current frame")
err("image: No such file or directory (os error 2)")
```

### Errors

A source that is missing or cannot be decoded, a crop outside the image, and too many
conversions waiting are error values. The options are checked at once as runtime
errors: a `width` outside 1 to 12,000, a `format` other than jpeg, png or webp, a
`crop` without whole pixels or with `w` or `h` of 0, and a path outside the program's
folder.

```quillo
let r = image.convert("nothing.jpg", "out.jpg")
print(is_err(r), r.error)
```

```output
true image: No such file or directory (os error 2)
```

```quillo error
print(image.convert("a.png", "b.png", { format: "gif" }))
```

```output
line 1: `image.convert`: format is jpeg, png or webp, got "gif"
```

```quillo error
print(image.convert("a.png", "b.png", { crop: { x: 0, y: 0, w: 0, h: 1 } }))
```

```output
line 1: `image.convert`: crop is { x, y, w, h }, whole pixels, w and h above 0
```

### Chaining

The source path comes first, so a pipeline passes it; `?` in a route turns a failed
conversion into the request's answer, and the `{ width, height }` can be stored with
the file.

```quillo noexec
route POST /photos { files: { photo } } {
    let src = save_upload(photo, "uploads")
    let size = image.convert(src, `web/${uuid()}.jpg`, { width: 1600 })?
    db.exec("insert into photos (path, w, h) values (?, ?, ?)", src, size.width, size.height)
    redirect("/photos")
}
```

```quillo
print("nothing.jpg" | image.convert("out.jpg") | is_err)
```

```output
true
```

### See also

[image.info](/docs/reference/image.info/), [save_upload](/docs/reference/save_upload/), [file](/docs/reference/file/), [is_err](/docs/reference/is_err/), [uuid](/docs/reference/uuid/)
