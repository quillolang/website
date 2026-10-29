# Quillo plugins

The Rust plugins on [quillolang.org/plugins](https://quillolang.org/plugins/): one `.qwer`
file each, with an example program beside it (`<slug>.qwe`). `plugins.qwe` at the site's
root makes the pages from `catalog.json` and the files themselves.

## Adding one

1. Write `<slug>.qwer`. The first `//!` line says what it is, in one sentence; the
   second is its version, `//! version: 1.0.0`; then `//!`, `//! [dependencies]` and
   the crates. Change the version with every change: the last number for a fix, the
   middle one for a new function, the first for a change that breaks programs using it. Each `pub fn` gets a `///` line, which the
   site shows under the function.
2. Write `<slug>.qwe`, an example with routes: a header comment saying how to run it,
   `use "<slug>.qwer"`, and a route or two that show the functions at work.
3. Add it to `catalog.json`: `slug`, `name`, `group` (one of the groups in
   `plugins.qwe`), `tags`, `summary`, and `try`, the requests to make and what each
   answer must contain. `needs` (`"smtp"`, `"redis"`, `"http"`, `"printer"`, or a module in `standins/`) starts a stand-in server, `env`
   sets variables, and `files` lists other files to download beside it.
4. Run `QUILLO=/path/to/quillo node plugins/test.mjs <slug>`: it builds the plugin, runs
   the example and makes the `try` requests. `export.sh` runs every plugin's test.
5. Run `plugins/zip.sh` before deploying: the zip of all plugins is not in git.

Things learned writing the first 37:

- **Write parameter types in full.** Quillo's glue writes them as the plugin spells them,
  outside its `use` lines: `rows: Vec<HashMap<String, Value>>` fails to build, but
  `rows: Vec<std::collections::HashMap<String, serde_json::Value>>` builds. Return
  types are fine. (A Quillo bug, to report.)
- **Pin crate versions you know.** cargo takes the newest version that matches. calamine
  0.26 no longer builds against the quick-xml it now gets (0.31 does), iban_validate 4
  has no BIC type, printpdf 0.7 measures in `f32`, and csscolorparser 0.7 renamed its
  `to_*_string` methods to `to_css_*`.
- **Excel numbers are floats.** The spreadsheet plugin gives whole ones back as ints.
- **A `file()` value cannot be a `respond` body.** Return `file(path)` itself; its type
  comes from the extension.

- **Write floats as floats.** `quillo check` refuses an int for an `f64` parameter
  (`wav_tone(path, 880, ...)`): write `880.0` in examples, or take `i64` when whole
  numbers are what callers have.
- **Maps reach Rust with their keys sorted.** When order matters (XML, SOAP, OpenAPI),
  add `serde_json = { version = "1", features = ["preserve_order"] }` to the plugin's
  dependencies.
- **Crate traps met:** `cacache` 13 needs a runtime feature; `css-inline` 0.14's
  `inline_fragment` keeps only the first element; `lol_html`'s `element!` panics on a
  bad selector (parse it first); `rsa` 0.9's PKCS#1 signing needs `sha2` with `oid`;
  `rand_distr` 0.4 takes a negative standard deviation; `rxing` 0.7.1's `detect_in_luma`
  swaps width and height (use the `_with_hints` version); `rphonetic`'s Soundex panics
  on non-ASCII letters; `polodb_core` 4 and 5 build RocksDB in C++ (3.5 is pure Rust);
  a crate bundling SQLite opens files with its own locks, beside Quillo's.

### Quillo issues found while writing them

Each with a one-line repro, for the next FEEDBACK report:

- A crate named like `serde_json_path` stops the glue adding `serde_json`: `//! serde_json_path = "0.7"` with `use serde_json::Value;` fails with "unresolved import serde_json".
- A raw identifier (`r#type`) hides every `pub fn` after it: `fn f() -> i64 { let r#type = 2; r#type }` then `pub fn one() -> i64 { 1 }` gives "unknown name `one`".
- Parameter types are written without the plugin's `use` lines: `rows: Vec<HashMap<String, Value>>` fails to build.
- `quillo check` refuses an int where a Rust `f64` is expected, though the call would work: `f(2)` for `pub fn f(x: f64)`.
- `set(m, k, v)` as a statement does nothing, and nothing says so: `for x in [1] { set(m, "a", 1) }` leaves `m` as it was.
- `reply` cannot answer with headers: `reply respond(429, "x", { "retry-after": "5" })` is refused.
- No builtin says whether a file exists: `exists("data/x")` is an unknown name.
- A query field named after a keyword cannot be bound: `route GET /due ? { in: str }`.
- A route variable hides a function of the same name without a warning: `? { currency: str } = currency(currency)`.
- A path piece cannot be a parameter with a suffix: `route GET /og/:id(int).png`.
- `.error` on a value that is not an error is a runtime 500 that `quillo check` does not see.
- An HTML `respond(...)` gets the prefetch script added, an email preview too.
- `\f` is not a string escape: `"a\fb"` gives "unknown escape `\f` in string".
- There are no hex integer literals: `f(0x0CF00400)` gives "expected `)` after arguments".
- `quillo check` does not see arguments in the wrong order for `reduce`: `reduce(xs, (a, x) => a + x, 0)` fails only when run.
- A plugin's `pub fn f() -> serde_json::Map<String, serde_json::Value>` is "not exported", nor is `serde_json::Map` taken as a parameter type; `Value` and `std::collections::HashMap<String, serde_json::Value>` are.
- A plugin parameter named like one of the file's private functions hides it inside that function: "expected function, found `&str`".
- `quillo check` says "ok" for a program whose plugin does not compile: the Rust error only shows at `quillo run` (an `ocr.qwer` calling `.take()` on a `Box<dyn Read>` without `use std::io::Read`).
- A field of a bound JSON body read through `json` is null, silently: `route POST /a { json: { speed: int } } = { v: json.speed }` gives `null` and `quillo check` says ok; the value is bound as `speed`. (`graphql_parse.qwe` had `guard(json.query)`.)
- `reply` is a keyword, so it cannot be a variable: `let reply = f()` is refused, a name RPC code reaches for.
- SIGTERM does not stop a server while a plugin call is blocked: the process keeps its port until `kill -9`, so the next start finds "Address already in use".

## The first 37

| Group | Plugins |
|---|---|
| Data formats | `csv`, `encoding` (base64, hex, URL decoding), `feed` (RSS, Atom, JSON Feed), `gzip`, `toml`, `xml`, `yaml` |
| Files | `archive` (zip), `pdf`, `spreadsheet` (Excel read and write) |
| Security | `bcrypt`, `file_hash`, `ipnet`, `jwt`, `sanitize`, `totp` |
| Text | `diff`, `fuzzy`, `lang`, `scrape`, `slug`, `useragent` |
| Validation | `email_address`, `iban`, `phone`, `semver` |
| Time and IDs | `cron`, `ical`, `seeded`, `ulid` |
| Media | `blurhash`, `color`, `qr` |
| Services | `redis`, `s3`, `smtp` |
| Places | `geo` |

## The 200 after them

Written on 2026-10-29: 50 each for security and data formats; files and media; text, validation,
IDs and data structures; and stores, developer tools, web, places, numbers and devices. Every
one is in `catalog.json`, built and tested by `test.mjs`.

## The 150 after those

Written on 2026-10-29, in four batches (`catalog-e.json` … `catalog-h.json`, merged into
`catalog.json`): printers, devices, numbers and stores; data formats, files, developer tools and
data structures; security, web, services and validation; text, media, time and places. A new
group, **Printers**, has the industrial label printers' languages (ZPL with a PNG preview, EPL,
TSPL, DPL, IPL, SBPL, CPCL, EZPL, Brother P-touch raster), ESC/P, PCL and PJL, raw 9100 and LPR
printing, status questions, IPP, GS1 labels and label sheets. `needs: "printer"` gives their
examples a printer on a raw socket. Not yet tried on real printers: DPL's QR and Data Matrix
records, EZPL's barcode parameter order, EPL's QR command, IPL (an older manual), and the
P-touch 128-pin raster layout.

Crate traps met in these:

- **Pure Rust TLS:** rustls 0.23 defaults to aws-lc-rs (C): `default-features = false,
  features = ["ring", "std", "tls12", "logging"]`.
- **Pins:** `jaq-core =2.2.1`, `jaq-std =2.1.2`, `jaq-json =1.1.3` (jaq 3 changed its API);
  `icu_calendar =1.5.2` (2.x changed it; months are codes, a leap month ends in `L`); `fake
  =2.10.0` with rand 0.8 (fake 5 needs rand 0.9); cuid2 0.1.6 needs Rust 1.88.
- **yrs 0.28:** take every `get_or_insert_*` reference before `transact()`, or it waits forever,
  and the request with it; set `OffsetKind::Utf16` to count like Yjs in the browser.
- **Canonical JSON:** numbers through ryu-js, serde_json's `float_roundtrip`, keys sorted by
  UTF-16 code units.
- **ron 0.8** cannot read structs, options or chars into `serde_json::Value`; the plugin parses
  RON itself.
- **lightningcss:** `default-features = false, features = ["browserslist"]`. **grass:** depend on
  `grass_compiler` to write a `Logger`. **biscuit-auth 6** needs its default features.
- **cookie 0.18**'s signed jar signs the value, not the name: sign `name=value` yourself.
- **hickory-proto 0.24** parses zones only with `text-parsing`.
- **isbn 0.8** calls a wrong ISBN-13 check digit an "invalid digit": check the digit first.
- **lofty 0.22:** write `IntegerBpm`, not `Bpm`; removing a tag on disk is
  `TagType::remove_from_path`. **thumbhash** takes at most 100×100 pixels.
- **fluent-bundle** wraps arguments in U+2068/U+2069 unless `set_use_isolating(false)`.
  **wana_kana 5** turns ー into vowels unless `keep_prolonged_sound_mark`.
  **hyphenation** wants exact codes (`de-1996`, `el-monoton`).
- **proj4rs** works in radians; EPSG codes need `crs-definitions`.
- **printpdf 0.7**'s built-in fonts are WinAnsi only: `font_subsetting` with an external font
  (the `dejavu` crate) for other scripts. **fitparser 0.9** gives local times: convert to UTC.
- **mail-parser 0.9**'s `body_html(0)` makes HTML from a text-only message: look for an HTML part.
- **sourcemap 9:** `decode_slice`, and flatten index maps.
- Services read their base URL from env (`<SERVICE>_API_URL`, `SINK_URL` in tests), so a test
  never reaches the real service.

## Protocols and message brokers

Written on 2026-10-30, 39 in two new groups. **Messaging**: mqtt, nats (with JetStream),
amqp (RabbitMQ), kafka, zeromq, redis_streams, pusher, stomp, beanstalkd, nsq, sqs, pubsub,
azure_servicebus. **Protocols**: grpc (a `.proto` read at run time), json_rpc, xml_rpc, soap,
websocket_client, webdav, proxy_protocol, syslog, statsd, influx, coap, snmp, mdns,
wake_on_lan, ntp, tftp, radius, s7 (Siemens PLCs), ldap, ftp, imap, pop3, smpp, iso8583,
fix_protocol, mllp. A plugin cannot call a program, so subscriptions buffer on a thread of
their own and `<x>_receive(name, max, wait_ms)` hands over what came: drain it from an
`every` tick or a route.

Their tests run against stand-ins in `standins/` (any `needs` that is not built in names one),
written from the protocols' specifications; `proto_tls.mjs` and `protocols_tls.mjs` hold test
CAs. Most were also tried against the real thing: nginx, Apache mod_dav, Artemis, nsqd,
ElasticMQ, the Pub/Sub emulator, InfluxDB 2 and 3, Telegraf, net-snmp, python-snap7, aiocoap,
pyrad, UnboundID, pyftpdlib, GreenMail, jsmpp, pyiso8583, QuickFIX/J and python-hl7. Not tried
against real servers: mqtt, nats, amqp, kafka and redis_streams (stand-ins only), beanstalkd
and Service Bus, and the brokers' TLS and SASL options.

Crate traps met in these:

- **rustls everywhere:** crates' `rustls` features often mean aws-lc-rs (C): rumqttc's
  `use-rustls-no-provider`, async-nats with `ring`, ldap3 `tls-rustls-ring`, suppaftp
  `rustls-ring`; redis 0.32's `tls-rustls` uses the process-wide provider, so install ring's
  first. gRPC over TLS needs ALPN `h2`. A rustls stream cannot be split for a reader thread.
- **rumqttc 0.25:** 10 KiB packets by default (`set_max_packet_size`); panics on a v5 keep-alive
  under 5 s and on `clean_session(false)` with an empty client id; `publish` returns no ack.
- **async-nats 0.51** parses `user:pass@` in the URL but never sends it.
- **zeromq 0.7:** `connect` waits forever; REQ/PUSH fail with no peer instead of queueing; a REQ
  whose request timed out must be rebuilt; give subscribers a moment before the first publish.
- **rskafka 0.6:** default features build zstd and lz4 from C; no retry deadline by default; no
  consumer groups. **lapin 4:** `ShortString::from` panics past 255 bytes.
- **suppaftp 12:** no read timeout on the greeting (connect your own `TcpStream`), none on passive
  data either. **ldap3 0.12:** `SearchEntry::construct` panics on referrals (`EntriesOnly`).
- **tungstenite 0.26:** `features = ["handshake"]` with your own rustls stream; a server picking no
  subprotocol is an error; a read timeout is `WouldBlock` on macOS.
- **prost-reflect 0.14:** JSON writes 64-bit ints as strings and skips defaults unless told.
- **mdns-sd 0.13:** one browse per service type per daemon. RustCrypto: md-5/sha1/sha2 0.10 with
  hmac 0.12 and aes/des 0.8; don't mix in the newer lines.
- **Node stand-ins:** close a dgram socket a moment after its last send; end a TLS socket a moment
  after its handshake; retry a bind on EADDRINUSE.

## Ideas, to write later

Each idea has the crate to start from. A star (★) marks those that fill a gap in the
standard library people meet early.

### Security and sign-in

- ★ **passkeys**: WebAuthn registration and sign-in (`webauthn-rs`).
- **saml**: SAML 2.0 sign-in for enterprises (`samael`; needs libxml2, so harder).

### Data formats


### Files and documents

- **minify**: HTML and CSS made smaller (`minify-html`, `lightningcss`).

### Images


### Text


### Validation and reference data


### IDs


### Stores and services

- **mongodb**: MongoDB's find, insert, update and aggregate (`mongodb` with its sync API).
- **apns**: push notifications to iPhones (`a2`).
- **sftp**: files to and from SFTP servers, for partners who still use them (`russh-sftp`).
- **gcs** and **azure_blob**: signed links for Google Cloud Storage and Azure (by hand, or their crates).

### Places

- **ip_location**: an IP address's country and city, from a GeoLite2 file (`maxminddb`).

### Numbers


### CLI and RPC (next, after the 200)

- **cli**: plugins that wrap command-line tools and parse their output: `git`, `ffmpeg`,
  `pandoc`, `imagemagick`, `pg_dump`, run with arguments as a list (never a shell
  string), a timeout and an output limit.
- **cli_args**: argument parsing for Quillo scripts run from the command line (`clap`).
- **thrift** and **capnp**: Apache Thrift and Cap'n Proto messages and clients.

### Hardware

- **serial**: read and write serial ports, for scales, sensors and printers (`serialport`).
- **receipts**: ESC/POS receipt printers (`escpos`).
