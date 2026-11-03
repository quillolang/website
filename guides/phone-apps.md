# Phone apps

A Quillo program can run inside an iOS or Android app. The runtime is linked into the
app and runs the program on the phone itself, inside the app, for the app's own web
view, so the app works offline and keeps its SQLite database in its own storage. The program is the same
one you run as a server: routes, components, `server fn`s, migrations, uploads and jobs
all work as they do there.

Phone apps are in preview. What works today, and what does not yet:

| | |
|---|---|
| **A real iPhone** | Works: Fieldbook on an iPhone 17 Pro Max (iOS 26.7.1), with real GPS, compass, camera and microphone, and no change to the program |
| **iOS simulator** | Works: built with one script, run end to end (pages, forms, uploads, SQLite, jobs, a background and foreground cycle, a relaunch with its data) |
| **Android emulator** | Works: built with one script, run end to end on Android 15, the system's permission prompts answered both ways. Not yet tried on a real Android phone |
| **Store builds** | Built, not yet uploaded: an iOS archive ready to sign, and a signed Android App Bundle targeting Android 16, as Google Play requires |
| **HarmonyOS NEXT** | Planned (HarmonyOS 2 to 4 run the Android app as it is) |
| **`.qwer` plugins** | Not yet: a phone has no compiler, and linking plugins into the app ahead of time is still to be built |

### How it works

The app starts the program when it opens. The program's folder is copied from the app
into the app's own storage and runs from there, so `db.open("app.db")`, uploads and files
the program writes stay on the phone, with the app. An app update brings new code; the
program's databases are never overwritten by it.

The program runs in the app's process with no HTTP server: nothing listens, so no other
app on the phone, and no page in the phone's browser, can reach it. The web view asks
the app itself for each page, through an address of the app's own, and the app hands the
request to the program:

| | iOS | Android |
|---|---|---|
| The pages' origin | `quillo://app` | `https://quillo.localhost` |
| How a request reaches the program | the app's `WKURLSchemeHandler` | the WebView's `shouldInterceptRequest` |

The origin is the same at every launch, so what the pages keep in `localStorage` and
IndexedDB stays from one launch to the next. An app installed before this kept them under
its old address, `http://127.0.0.1:<port>`: its database is the program's and is kept,
but what its pages kept in the browser stays with the old address and is not copied.

What the scheme cannot carry goes through the app's message bridge: the connections live
data and channels keep open, a body on Android (whose interceptor carries none), and on
iOS a file or a `FormData` (WebKit gives the handler none of its bytes). The script the
app runs before every page sends them that way, a page's own `fetch` with a body
included; a form with a file (iOS) or any form that posts (Android) is sent through the
bridge, and the page then goes to its answer, as after an ordinary post and redirect.
The program sees none of this: routes, `request`, sessions, uploads, `server fn`s, live
data and channels work as they do on a server.

The web view keeps no cookies for the app's own address, so the app keeps them: the
cookies the program sets are kept in `.quillo/cookies.json` in the app's storage and sent
back with each request. Sessions are signed with a key the app makes once and keeps in
its storage, so a person stays signed in from one launch to the next. `request.ip` is
`"app"`. Jobs, ticks and calls made `later` reach the program with no connection.

What differs from a browser, then:

- `document.cookie` is empty: a page's own script cannot read or write the program's
  cookies. The program's cookies still reach the program.
- Service workers do not run on the app's address. Quillo does not use them; a program's
  own one does not start.
- A `stream` or `events` route's answer reaches the page whole, when it ends, not as it
  is made. Live data and channels, which go through the bridge, are not affected.
- The app needs no exception for plain HTTP: the iOS app has no App Transport Security
  exception for local networking, and the Android app allows no cleartext traffic.
- Safari's and Chrome's inspectors work as before; the page's address is
  `quillo://app/...` or `https://quillo.localhost/...`.

The runtime is the same code on both systems; only the app around it differs:

| | iOS | Android |
|---|---|---|
| The app | Swift, built by `swiftc` (no Xcode project) | Kotlin, built by Gradle (the wrapper is in the project) |
| The web view | WKWebView (Safari's engine) | WebView (Chrome's engine) |
| The runtime | a static library with a C entry | a shared library with a JNI entry |
| The program | in the app bundle | in the APK's assets, unpacked at launch |

### Naming your app: `app.toml`

A program says what its app is called in an `app.toml` beside its main.qwe, read by both
build scripts:

```toml
name = "Fieldbook"                  # under the icon
id = "org.quillolang.fieldbook"     # bundle id / application id; never changed once published
version = "1.0.0"                   # what people see in the store
build = 1                           # a whole number, higher for each upload
icon = "icon.png"                   # 1024 x 1024 PNG without transparency; Quillo's when left out
site = "https://app.example.com"    # a site of yours the web view keeps (see below)
env.SHOP_URL = "https://shop.example.com"   # what env("SHOP_URL") gives on the phone
```

A bad value stops the build and says what is wrong. The icon becomes an asset catalog on
iOS, and launcher and adaptive icons at every density on Android.

**`env.NAME = "value"`** lines are what `env("NAME")` gives on the phone. A phone has no
environment, and the program's `.env` is not read there (nor put in the app). Under
`quillo run` the same code takes `NAME` from the `.env` as usual. These values are
public: anyone can unzip an app and read everything in it, so put addresses here, never
secrets.

**`site`** is an https address with no path. Pages of that origin stay in the app's web
view, and `window.quilloNative` answers them as it answers the program's pages. The
bundled program still starts first, and can link or redirect there. An app that is only
a website in a frame is turned down by Apple's App Review (guideline 4.2), so give the
app something of its own.

### Building it

On a Mac with Xcode, for the iOS simulator:

```sh
rustup target add aarch64-apple-ios-sim
mobile/ios/build.sh path/to/program --run
```

For Android, with the Android SDK (platform 35, build-tools, the NDK), a JDK 17 and
`cargo-ndk`:

```sh
rustup target add aarch64-linux-android x86_64-linux-android
cargo install cargo-ndk
mobile/android/build.sh path/to/program --run
```

Each script builds the runtime for its system, copies the program's folder into the app,
builds the app, and with `--run` installs and opens it on a running simulator, emulator
or connected phone. The folder is copied the same way for both systems: everything but
`.env` and `.env.*`, `.git/`, `.quillo/` and any other dotfile (`.well-known/` is kept),
databases, `uploads/`, and a subfolder that is a program of its own. A folder whose name
starts with `_` goes in on both. The build prints what it left out, and when that
includes a `.env` it says so: "a .env is the server's: put public values in app.toml as
env.NAME".
The scripts are in [mobile/](https://github.com/quillolang/quillo/tree/main/mobile) in
Quillo's repository; its README says how to install what they need.

For screenshots and tests, both apps take scripts to run in the page as it loads. Given
several, they run in turn, one per page loaded, so one can go to a page and the next act
on it:

```sh
# iOS simulator
xcrun simctl launch booted org.quillolang.app \
  --eval "location.href='/new'" --eval "document.querySelector('button').click()"

# Android
adb shell am start -n org.quillolang.app/.MainActivity \
  --es eval "\"location.href='/new'\"" --es eval2 "base64:$(base64 < steps.js)"
```

An Android emulator can also be tapped (`adb shell input tap x y`), so a test can answer
the system's permission prompts; the iOS simulator's prompts cannot be answered from the
command line. Android takes these scripts in debug builds only, since other apps on a phone
could otherwise start the app with a script of their own.

### On your own iPhone

No paid account is needed to run on your own phone, but the app stops launching after 7
days until it is installed again:

1. Turn on Developer Mode on the phone (Settings, Privacy & Security), and connect it.
2. Make a small Xcode project with the app's id, choose your Personal Team under Signing &
   Capabilities, and run it on the phone once. Xcode makes the certificate and a profile.
3. Build with them. The phone must be unlocked:

```sh
QUILLO_IOS_IDENTITY="Apple Development: Your Name (ABCDE12345)" \
QUILLO_IOS_PROFILE="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles/<uuid>.mobileprovision" \
mobile/ios/build.sh path/to/program --device --run
```

4. The first launch needs your developer profile trusted, once: Settings, General, VPN &
   Device Management.

### Builds for the stores

```sh
mobile/ios/build.sh path/to/program --archive       # an .ipa for App Store Connect
mobile/android/build.sh path/to/program --release   # a signed APK and an App Bundle for Google Play
```

The iOS archive has what App Store Connect looks for: arm64, the icon, a privacy manifest
and the build keys Xcode writes. It is signed when given a certificate and a provisioning
profile from an Apple Developer account, and unsigned, ready to sign, without them. The
Android release targets Android 16 and runs from Android 8; without a key given, an upload
key is made once for the app's id in `~/.quillo/android/`. Keep that key backed up: Google
Play knows the app by it.

### Where the program runs: `platform()`

[`platform()`](/docs/reference/platform/) tells a program where it runs, as a map: the
system and its version, the kind of device and its model, whether it is a simulator or
an emulator, and how the program runs (`"mobile"` in a phone app, `"app"` in `quillo
app`, `"server"` otherwise). In a phone app the app adds what only it knows: the screen,
the memory, the locale and the app's own name and version. It runs on the server, so a
component asks for it through a `server fn`:

```quillo noexec
server fn device() -> map = platform()

component About() {
    state p = device()
    <p>{p.os_name} {p.os_version} on {p.model}{p.simulator ? " (simulator)" : ""}</p>
}
```

What it said on each:

| | iOS simulator | Android emulator |
|---|---|---|
| `os`, `os_name`, `os_version` | `"ios"`, `"iOS"`, `"27.0"` | `"android"`, `"Android"`, `"15"` |
| `model`, `model_family` | `"iPhone19,2"`, `"iPhone"` | `"sdk_gphone64_arm64"`, `"Google"` |
| `simulator`, `runtime` | `true`, `"mobile"` | `true`, `"mobile"` |
| `screen` | `{ width: 402, height: 874, scale: 3 }` | `{ width: 411, height: 914, scale: 2.625 }` |
| `app` | `{ name: "Quillo", id: "org.quillolang.app", version: "0.6.0", build: "1" }` | the same |

### The phone's hardware

What the web gives a page works in the app's web view as it does in the system's
browser: the camera and the microphone through `getUserMedia`, recording with
`MediaRecorder`, a photo through `<input type="file" accept="image/*" capture>`, the
share sheet through `navigator.share`, storage, speech. The app asks the person once,
with the system's own prompt, and then grants them to its own pages.

For what a web view cannot reach, both apps put `window.quilloNative` on the program's
pages (and on the `site` of `app.toml`), and only on them, and a component calls it with
`js()`. An `<iframe>` of another site stays in the page, and gets no `quilloNative`:

| Call | Gives |
|---|---|
| `js("quilloNative.location")` | `{ lat, lon, accuracy, altitude, speed, course, at }` from the phone's location services, asking the person the first time |
| `js("quilloNative.haptic", "success")` | a tap the person feels: `light`, `medium`, `heavy`, `rigid`, `soft`, `success`, `warning`, `error`, `selection` |
| `js("quilloNative.battery")` | `{ level, state, low_power }`; `level` is null when the system does not say |
| `js("quilloNative.notify", title, body, seconds)` | a local notification in `seconds`, asking the person the first time |
| `js("quilloNative.keepAwake", true)` | the screen stays on while the app is open |
| `js("quilloNative.brightness")`, `js("quilloNative.brightness", 0.8)` | the screen's brightness, read or set |
| `js("quilloNative.share", text, url)` | the system's share sheet |
| `js("quilloNative.openSettings")` | the app's page in Settings, to turn on what was refused |
| `js("quilloNative.wait", ms)` | a pause of up to 60 s, which a component has no other way to take |
| `js("quilloNative.info")` | the calls this app has |

Each call gives a Promise, which Quillo waits for in an event handler, in `@mount`, in a
`state` initializer and in a component's `let` functions. When the person has refused, the
call gives an error value with the reason, the same on both systems:

```quillo noexec
component Spot() {
    state place = null
    state note = null
    let locate = () => {
        let p = js("quilloNative.location")
        if is_err(p) { note = p.error } else { place = p; js("quilloNative.haptic", "success") }
    }
    <div>
        <button onclick={locate}>Where am I?</button>
        {place != null && <p>{place.lat}, {place.lon} ±{place.accuracy} m</p>}
        {note != null && <p class="note">{note}</p>}
    </div>
}
```

Where the two web views differ, as a page in each found. The iOS column is a real iPhone; a
simulator refuses more than a phone does, so test on one:

| | iOS | Android |
|---|---|---|
| `navigator.geolocation` | asks again, in the name of the page's address: use the app's location | granted with the app's location permission |
| `capture` on a file input | the camera | the camera (the app opens it), else the photo picker |
| Motion and orientation | after a tap of the person's own, then real events and the compass | events without asking |
| `navigator.vibrate`, `getBattery`, `connection` | not there (the app's calls stand in) | there; vibration only after a tap |
| `navigator.wakeLock` | there, from a tap | there |
| `speechSynthesis` | there | not in the web view |
| Bluetooth, USB, Serial, HID | not there | not there |
| The clipboard | writing from a tap; reading is refused | only from a tap, in a focused page |

### Calling your server

The program on the phone can reach a server of yours. Do it from a `server fn`, which
runs in the app's own runtime, not from the page: the page's origin is the app's own
(`quillo://app`, `https://quillo.localhost`), which a server cannot safely allow. A page's `http.*` to another site that fails says
so:

```
http: no answer from api.example.com: it may not allow this page (CORS), or be plain http, or be unreachable; a server fn can call it from the server
```

When the server is a Quillo site, `site` declares it, and its `server fn`s are called as
the program's own:

```quillo noexec
site shop = env("SHOP_URL", "https://shop.example.com")   // env.SHOP_URL in app.toml

server fn latest(n: int) = shop.notes(n)                  // the site's `server fn notes`

component Notes() {
    state notes = latest(20)
    <ul>{for n in notes => <li key={n.id}>{n.text}</li>}</ul>
}
```

The other side is an ordinary program on your server, whose `server fn` is the one
called; nothing in it is for the app:

```quillo noexec
// shop.qwe, run at https://shop.example.com
db.open("shop.db")
db.exec("create table if not exists notes (id integer primary key, text text not null)")

server fn notes(n: int) -> list = db.query("select id, text from notes order by id desc limit ?", n)
```

Tried on one machine, with `quillo run shop.qwe --port 8081` and the app's program run as
`SHOP_URL=http://127.0.0.1:8081 quillo run main.qwe`, its page lists the shop's notes.

- **What a call gives.** `shop.notes(a, b)` gives the site's answer, or the site's error
  as an error value, or an error value when the site cannot be reached. Decimals and
  big ints cross as they do between a page and its program.
- **The address** is any expression: a string, or `env(...)` with a default.
- **Signed in stays signed in.** In a phone app (and in `quillo app`, or with
  `QUILLO_SITE_COOKIES=1`), the cookies the site sets are kept in
  `.quillo/sites/<name>.json` in the program's folder, so whoever signed in to the site
  stays signed in. On a server they are not kept, since one visitor's session would be
  every visitor's; a line in the log says so once.
- **Server side only.** `quillo check` refuses `shop.notes()` in a component: call it in
  a `server fn`. Elsewhere `site` is an ordinary name, so `let site = ...` still works.
- **The wire** is the one a site's own pages use, and it is stable:
  `POST <url>/_quillo/rpc/<fn>` with the arguments as a JSON array, answered with
  `{"ok": value}` or `{"err": error}`. A program needs no `Origin` header; a request
  with another site's `Origin` is refused.
- **Services.** On a phone a `service` always runs inside the app. To use one on your
  server, call the server with `site`, not `service`.

While you build the app, the server may be the computer it is built on:

- **The iOS simulator** shares the Mac's network, so `http://127.0.0.1:8080` reaches a
  server on the Mac. **A real iPhone** asks the person first before the app reaches a
  computer on the local network (the app says why, in `NSLocalNetworkUsageDescription`).
- **Certificates.** The runtime's own `http.*` and `site` calls trust the certificate
  roots built into Quillo, not the phone's, so a company's certificate authority
  installed on the phone is not trusted by them.
- **Plain http.** App Transport Security does not cover the runtime's own connections,
  so the program can reach plain `http://` addresses. Use https all the same.

### When the app leaves the screen

**iOS** suspends an app soon after it leaves the screen, and the program with it; the
app keeps the cookie jar on disk as it leaves. A `schedule` job does not run while the app is away; when the app comes back, a job
whose time passed runs once, not once per missed run, and then keeps its schedule.

**Android** lets the app keep running behind the home screen: the program goes on
answering and a job every minute went on running while the app was away. The system can
still stop the process later to save memory or battery; the program starts again from
its database when the app is opened.

Work that must happen while the app is closed needs the system's own means (background
tasks, push notifications), which the runtime does not offer yet.

### What a phone build leaves out

| | |
|---|---|
| Compiled numbers | no JIT on phones: number-heavy functions run in the interpreter |
| WebTransport and WebSockets | channels and live data go through the app's bridge |
| `.qwer` plugins built at run time | a phone has no compiler |
| Starting processes | `quillo run`'s options `--instances`, `--split` and `--with` ([the options](/docs/)): the app is one process |

### An example: Fieldbook

[Fieldbook](https://github.com/quillolang/quillo/tree/main/mobile/examples/fieldbook) is a
field notebook built to try all of this on a phone: a note with the place from the app,
the compass, a photo with a thumbnail made on the phone by `image.convert`, a voice memo,
and the weather at that place from a web API; a page that tries 35 things a phone can do
and keeps the answers; a page of what `platform()` says; a job every minute; a CSV
export. It runs unchanged on an iPhone, the iOS simulator and Android: the probe on a real iPhone
gave 37 answers, 26 of them working, with no errors. What it found is written up in
[FEEDBACK18.md](https://github.com/quillolang/quillo/blob/main/feedback/reports/FEEDBACK18.md).
