# Phone apps

A Quillo program can run inside an iOS app. The runtime is linked into the app and
serves the program on the phone itself, to the app's own web view, so the app works
offline and keeps its SQLite database in its own container. The program is the same one
you run as a server: routes, components, `server fn`s, migrations, uploads and jobs all
work as they do there.

Phone apps are in preview. What works today, and what does not yet:

| | |
|---|---|
| **iOS simulator** | Works: built with one script, run end to end (pages, forms, uploads, SQLite, jobs, a background and foreground cycle, a relaunch with its data) |
| **iOS devices** | Not yet: a signed device build and the App Store are next |
| **Android** | Written (an activity, the JNI entry point, a Gradle build), not yet built and run |
| **`.qwer` plugins** | Not yet: a phone has no compiler, and linking plugins into the app ahead of time is still to be built |

### How it works

The app starts the program when it opens. The program's folder is copied from the app
into `Library/Application Support/quillo/app` and runs from there, so
`db.open("app.db")`, uploads and files the program writes land in the app's own
container. An app update brings new code; the program's databases are never overwritten
by it.

The program listens on `127.0.0.1` at a port the system picks, and only the app's web
view gets in: the first address it opens carries a token that the server answers once,
with a cookie, as `quillo app` does on a desktop. Another app on the phone reaching the
port gets 403. Sessions are signed with a key the app makes once and keeps in its
container, so a person stays signed in from one launch to the next.

### Building it for the simulator

You need a Mac with Xcode, and Rust's target for the simulator:

```sh
rustup target add aarch64-apple-ios-sim
mobile/ios/build.sh path/to/program --run
```

`build.sh` builds the runtime for the simulator, copies the program's folder into the
app (not its databases, nor subfolders that are programs of their own), builds the app
with `swiftc` (no Xcode project), and with `--run` installs and opens it on a booted
simulator. The scripts are in [mobile/](https://github.com/quillolang/quillo/tree/main/mobile)
in Quillo's repository, with its README.

For screenshots and tests, `--eval` runs a script in the page once it has loaded. Given
several times, the scripts run in turn, one per page loaded, so one can go to a page and
the next act on it:

```sh
xcrun simctl launch booted org.quillolang.app \
  --eval "location.href='/new'" \
  --eval "document.querySelector('button').click()"
```

### Where the program runs: `platform()`

[`platform()`](/docs/reference/platform/) tells a program where it runs, as a map: the
system and its version, the kind of device and its model, whether it is a simulator, and
how the program runs (`"mobile"` in a phone app, `"app"` in `quillo app`, `"server"`
otherwise). In a phone app the app adds what only it knows: the screen, the memory, the
locale and the app's own name and version. It runs on the server, so a component asks
for it through a `server fn`:

```quillo noexec
server fn device() = platform()

component About() {
    state p = device()
    <p>{p.os_name} {p.os_version} on {p.model}{p.simulator ? " (simulator)" : ""}</p>
}
```

On the iOS simulator it said:

```output
{ os: "ios", os_name: "iOS", os_version: "27.0", device: "phone", model: "iPhone19,2",
  model_family: "iPhone", simulator: true, runtime: "mobile", arch: "aarch64", cpus: 10,
  memory: 17179869184, locale: "en-SG", time_zone: "Asia/Singapore",
  screen: { width: 402, height: 874, scale: 3 },
  app: { name: "Quillo", id: "org.quillolang.app", version: "0.6.0", build: "1" }, ... }
```

### The phone's hardware

What the web gives a page works in the app's web view as it does in Safari: the camera
and the microphone through `getUserMedia`, recording with `MediaRecorder`, a photo through
`<input type="file" accept="image/*" capture>`, the share sheet through `navigator.share`,
storage, speech. The app grants the camera and the microphone to its own pages, having
asked the person once.

For what a web view cannot reach, the app puts `window.quilloNative` on the program's
pages, and a component calls it with `js()`:

| Call | Gives |
|---|---|
| `js("quilloNative.location")` | `{ lat, lon, accuracy, altitude, speed, course, at }` from the phone's location services, asking the person the first time |
| `js("quilloNative.haptic", "success")` | a tap the person feels: `light`, `medium`, `heavy`, `rigid`, `soft`, `success`, `warning`, `error`, `selection` |
| `js("quilloNative.battery")` | `{ level, state, low_power }`; `level` is null when the system does not say |
| `js("quilloNative.notify", title, body, seconds)` | a local notification, asking the person the first time |
| `js("quilloNative.keepAwake", true)` | the screen stays on while the app is open |
| `js("quilloNative.brightness")`, `js("quilloNative.brightness", 0.8)` | the screen's brightness, read or set |
| `js("quilloNative.share", text, url)` | the system's share sheet |
| `js("quilloNative.openSettings")` | the app's page in Settings, to turn on what was refused |
| `js("quilloNative.wait", ms)` | a pause of up to 60 s, which a component has no other way to take |
| `js("quilloNative.info")` | the calls this app has |

Each call gives a Promise, which Quillo waits for in an event handler, in `@mount`, in a
`state` initializer and in a component's `let` functions. When the person has refused, the
call gives an error value with the reason:

```quillo noexec
component Spot() {
    state place = null
    state note = null
    let locate = () => {
        let p = js("quilloNative.location")
        if is_err(p) { note = p.error } else { place = p; js("quilloNative.haptic", "success") }
    }
    <div>
        <button @click={locate}>Where am I?</button>
        {place != null && <p>{place.lat}, {place.lon} ±{place.accuracy} m</p>}
        {note != null && <p class="note">{note}</p>}
    </div>
}
```

Use the app's location rather than `navigator.geolocation`: the web view asks again for
its own, in the name of `127.0.0.1`, though the app already has the permission.

What the web view does not have: Web Bluetooth, NFC, USB, Serial and HID, vibration
(the app's haptics stand in), the battery and network-information APIs (the app's
battery does), and full screen. The orientation and motion sensors and the clipboard
answer only a person's own tap.

### When the app leaves the screen

iOS suspends an app soon after it leaves the screen, and the program's server with it.
A `schedule` job does not run while the app is away; when the app comes back, a job
whose time passed runs once, not once per missed run, and then keeps its schedule. Work
that must happen while the app is closed needs the system's own means (background tasks,
push notifications), which the runtime does not offer yet.

### What a phone build leaves out

| | |
|---|---|
| Compiled numbers | iOS allows no JIT: number-heavy functions run in the interpreter |
| WebTransport | channels to pages use the WebSocket |
| `.qwer` plugins built at run time | a phone has no compiler |
| Starting processes | `--instances`, `--split` and `--with`: the app is one process |

### An example: Fieldbook

[Fieldbook](https://github.com/quillolang/quillo/tree/main/mobile/examples/fieldbook) is a
field notebook built to try all of this on a phone: a note with the place from the app,
the compass, a photo with a thumbnail made on the phone by `image.convert`, a voice memo,
and the weather at that place from a web API; a page that tries 35 things a phone can do
and keeps the answers; a page of what `platform()` says; a job every minute; a CSV
export. What it found is written up in
[FEEDBACK18.md](https://github.com/quillolang/quillo/blob/main/feedback/reports/FEEDBACK18.md).
