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
folder. It does not write over the program's own files, as `write_file` does not: its
`.qwe` and `.qwer` files, `.env` and the databases it has open *(since 0.7)*, whatever
the case of the name or a Windows form of it (`.ENV`, `main.qwe.`). An image of more than 40 megapixels,
or one whose conversion would take more than about 640 MiB, is an error value *(since
0.7)*. At most four conversions run at once, and those running share about 1 GiB; past
64 waiting, it gives an error value at once. It needs the `fs` effect.

### Examples

```quillo noexec
image.convert("photos/a.jpg", "cache/a-800.jpg", {
    crop: { x: 100, y: 0, w: 1200, h: 675 },   // in the image's pixels
    width: 800,                                 // shrunk to it, never enlarged
    format: "jpeg", quality: 82,                // jpeg, png or webp (lossless)
})
image.convert(path, "thumbs/42.webp", { width: 160, format: "webp" })
```

A thumbnail of an upload: the form, then the route that saves the file, checks with
`image.info` that it is an image at all, and writes a 400-pixel WebP beside it:

```quillo noexec
route GET /photos =
    <form method="post" action="/photos" enctype="multipart/form-data">
        <input type="file" name="photo" accept="image/*" required/>
        <button>Upload</button>
    </form>

route POST /photos {
    let f = request.files.photo ?? reply 400 "Choose a photo"
    let id = uuid()
    let original = save_upload(f, `uploads/${id}`)?
    if is_err(image.info(original)) { delete_file(original); reply 415 "Not a JPEG, PNG, WebP or GIF" }
    image.convert(original, `thumbs/${id}.webp`, { width: 400, format: "webp" })?
    redirect(`/thumbs/${id}.webp`)
}

route GET /thumbs/:name = files("thumbs", name)
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

- A photo is read as it is shown: its EXIF orientation is applied, so a `crop` is in
  the turned image's pixels (those `image.info` reports), and the copy is upright.
- JPEG has no transparency, so transparent pixels are laid on white in a JPEG; there is
  no option for another colour. A PNG keeps them.
- Each conversion writes to a temporary file of its own and moves it in place, so two
  at once to one target both finish, the last one's file kept.
- A `width` larger than the image leaves the size as it is.
- A crop that reaches outside the image is an error value naming both sizes.
- The destination's folder is made when missing; an existing file is replaced.
- The format is what `format` says, whatever the destination's name ends in.
- A file that reads as an image but cannot be decoded (a GIF with no colour table,
  here) is an error value from the decoder.
- A target that is one of the program's own files is an error value before the source
  is read, as `write_file` refuses it: `main.qwe`, `.env`, the database.
- The size is read from the file's header before it is decoded: a small file can be a
  large image. Past 40 megapixels the error value says `` image: the image is
  12000×12000, more than the 40 megapixels converted ``; a crop or a `width` that needs
  too much memory, `` image: converting the 7000×5600 image so would take about ... MiB,
  more than the 640 converted at once ``.

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

```quillo
print(image.convert("photo.png", "main.qwe", { format: "png" }))
print(image.convert("photo.png", ".env", { format: "png" }))
```

```output
err("image: will not write main.qwe: it is one of the program's own files")
err("image: will not write .env: it is the program's settings (.env)")
```

### Errors

A source that is missing or cannot be decoded, a crop outside the image, a target that
is one of the program's own files, an image too large to convert, and too many
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
