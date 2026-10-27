# quillolang.org

The website of [Quillo](https://github.com/quillolang/quillo), written in Quillo: the
home page, the tour, the guides, and the docs, which are made from Quillo's own
`USERGUIDE.md` and `examples/` so they never drift from them. `brand/` holds the logo
and the banners for the site, GitHub and social accounts.

## Running it

The site needs a checkout of [quillolang/quillo](https://github.com/quillolang/quillo)
beside it, built once:

```sh
git clone https://github.com/quillolang/quillo.git ../quillo
(cd ../quillo && cargo build --release)

./link.sh                                         # content/ → ../quillo's docs and examples
../quillo/target/release/quillo run main.qwe --watch
```

`QUILLO_DIR=/path/to/quillo` names a checkout somewhere else (for `link.sh` and
`export.sh` alike).

## Publishing

quillolang.org is served as static files: `./export.sh` renders every page in
`/sitemap.txt`, the component bundles they load, fonts, favicon and link preview into
`dist/`, which goes to the host as it is. The components run in the browser and call
nothing on the server.

## Layout

| Path | What it holds |
|---|---|
| `main.qwe` | The home page and the routes |
| `docs.qwe` | The docs, cut from `USERGUIDE.md` into a page per `## ` section |
| `hero.qwe`, `hero/` | The home page's carousel and the code on each slide |
| `tour/`, `demos/` | The tour's snippets and the live components beside them |
| `guides/` | Hand-written guides (reactivity, async, real time, database, …) |
| `bench/` | The benchmark figures shown on the home page, from [quillolang/benchmarks](https://github.com/quillolang/benchmarks) |
| `brand/` | Logo and banners; `brand/render-banner.sh` renders the banners with headless Chrome |

## License

MIT
