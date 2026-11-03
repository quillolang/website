# Target platforms

One Quillo program is the server, the HTML and the components that run in the browser. This
page says where that program runs today, where it runs in preview, and where it does not
run yet, so you can tell before you start whether your platform is one of them.

| Where | Status | How |
|---|---|---|
| **Linux server**, x86_64 and arm64 | Works | The release downloads, linked against glibc 2.17, so they run on any distribution since 2014 (checked on CentOS 7) |
| **macOS**, Apple silicon | Works | The release download; also where Quillo is developed and its coverage measured |
| **macOS**, Intel | Built | The release download is built for it, but CI does not run it |
| **Windows**, x86_64 | Works | The release download, run in CI |
| **Browsers** | Works | Pages are HTML from the server and work with no script at all; components need a browser from 2020 on (below) |
| **Behind a proxy** | Works | nginx, Apache, Caddy or a load balancer in front of `quillo run`, with [`--trust-proxy`](/docs/#options-of-quillo-run) for the visitor's address |
| **Shared hosting** (cPanel) | Works *(since 0.7)* | `quillo fcgi` under Apache's or LiteSpeed's FastCGI, or `--listen unix:` behind the web server: see [Shared hosting](/docs/shared-hosting/) |
| **Desktop app** | Works on macOS | `quillo app` shows the program in a native window, with no socket; Windows and Linux take the same code, not yet run |
| **iPhone and iPad** | Preview | The program runs inside the app, offline; run on a real iPhone and in the simulator: see [Phone apps](/docs/phone-apps/) |
| **Android** | Preview | The same, run end to end in the emulator on Android 15; not yet on a real phone |
| **HarmonyOS NEXT** | Planned | HarmonyOS 2 to 4 run the Android app as it is |
| **Static files only** | Works | `quillo serve <folder>` serves a folder as a static host does, and a program can `files(...)` one |

### The server

`quillo run main.qwe` is one process with no runtime to install: the binary holds the
interpreter, the HTTP server, SQLite and the browser's runtime. Copy it to the machine,
copy the program's folder, and run it. [Install](/docs/install/) gives the downloads, and
[Hosting](/docs/hosting/) how to keep it running, in a container or not, behind a proxy
for HTTPS, and on several cores or servers.

| Part | Where it works |
|---|---|
| **SQLite** | Everywhere Quillo runs, phones included: it is built in |
| **PostgreSQL, MySQL and MariaDB** | Servers and desktop: they are network databases, and a phone app keeps its data in SQLite |
| **Rust in `.qwer` and `.rs` files** | Servers and desktop with `cargo` there, or built ahead with `quillo build` and loaded with `--no-build`; not on phones yet |
| **Plugins from the catalog** | The same as Rust files: they are Rust files |
| **Services** | Any two of the above that can reach each other over HTTP |

A Linux release is not linked statically or with musl, and none is planned: a static binary
cannot load plugins. On a system the releases do not cover (FreeBSD, 32-bit ARM), `cargo
build --release` in a checkout builds Quillo for it, untested.

### Browsers

A page is HTML from the server, so it shows in any browser, links and forms included,
before any script has run and in browsers with script turned off. Components take over in
the browser with Quillo's runtime, about 6,000 lines of JavaScript, which needs what
browsers have had since 2020: Chrome and Edge 85, Firefox 77 and Safari 13.1, or later. The
tests drive headless Chrome; Safari's engine is the one phone apps and the macOS app use.

Where a browser lacks something newer, the runtime goes without it: a call's time limit
needs `AbortSignal.timeout`, and without it the call waits as long as the network does.
Prefetching hands the page to the browser through speculation rules where it has them
(Chrome, Edge), and elsewhere fetches it in the background for the browser's cache.

### Desktop apps

`quillo app main.qwe` runs the program in a window of its own instead of a browser tab, with
the system's web view: WebKit on macOS and Linux, WebView2 on Windows. The program runs in
the window's process and nothing listens: no other program on the machine can reach it, so
`--port` and `--listen` are refused there. It is built only on request:

```sh
cargo build --release --features app      # Linux also needs libwebkit2gtk-4.1-dev and libgtk-3-dev
./target/release/quillo app main.qwe --watch
```

Only macOS has run it so far. See [Desktop apps](/docs/#desktop-apps) in the guide.

### Phones

On a phone the program runs inside the app, offline, with its SQLite database in the app's
own storage and no HTTP server: the app's web view asks the app for each page. The program
is the one you run as a server, unchanged. What works today, and what store builds still
need, is on [Phone apps](/docs/phone-apps/). Not yet: uploads to the App Store and Google
Play, HarmonyOS NEXT, `.qwer` plugins linked into the app, and work while the app is in the
background.

### Not a target yet

| What | Instead |
|---|---|
| Components compiled to WebAssembly | They compile to JavaScript |
| Serverless functions (AWS Lambda, Cloud Functions) | A Quillo program is a long-running server: run it on a machine or a container |
| Passenger, cPanel's Application Manager, starting the program | `quillo fcgi`, or `--listen unix:` behind the web server |
| `quillo run --sandbox` (seccomp and Landlock), and plugins built to WebAssembly | A [policy](/docs/concurrency-and-reloading/#the-policy) to narrow what a program may do |
| Linux built with musl, or statically | The glibc 2.17 releases, which run on old and new distributions alike |
| `quillo app` run on Windows and Linux | macOS, or the program in a browser tab with `quillo run` |

The guide's [Not built yet](/docs/not-built-yet/) list has the rest.
