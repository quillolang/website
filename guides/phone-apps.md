# Phone apps

A Quillo program can run inside an iOS or Android app. The runtime is linked into the
app and serves the program on the phone itself, to the app's own web view, so the app
works offline and keeps its SQLite database in its own storage. The program is the same
one you run as a server: routes, components, `server fn`s, migrations, uploads and jobs
all work as they do there.

Phone apps are in preview. What works today, and what does not yet:

| | |
|---|---|
| **iOS simulator** | Works: built with one script, run end to end (pages, forms, uploads, SQLite, jobs, a background and foreground cycle, a relaunch with its data) |
| **Android emulator** | Works: a debug APK built with one script, run end to end on Android 15, the system's permission prompts answered both ways |
| **Store builds** | Not yet: a signed iOS build for devices and the App Store, a signed Android release for the Play Store |
| **HarmonyOS NEXT** | Planned (HarmonyOS 2 to 4 run the Android app as it is) |
| **`.qwer` plugins** | Not yet: a phone has no compiler, and linking plugins into the app ahead of time is still to be built |

### How it works

The app starts the program when it opens. The program's folder is copied from the app
into the app's own storage and runs from there, so `db.open("app.db")`, uploads and files
the program writes stay on the phone, with the app. An app update brings new code; the
program's databases are never overwritten by it.

The program listens on `127.0.0.1` at a port the system picks, and only the app's web
view gets in: the first address it opens carries a token that the server answers once,
with a cookie, as `quillo app` does on a desktop. Another app on the phone reaching the
port gets 403. Sessions are signed with a key the app makes once and keeps in its
storage, so a person stays signed in from one launch to the next.

The runtime is the same code on both systems; only the app around it differs:

| | iOS | Android |
|---|---|---|
| The app | Swift, built by `swiftc` (no Xcode project) | Kotlin, built by Gradle (the wrapper is in the project) |
| The web view | WKWebView (Safari's engine) | WebView (Chrome's engine) |
| The runtime | a static library with a C entry | a shared library with a JNI entry |
| The program | in the app bundle | in the APK's assets, unpacked at launch |

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

Each script builds the runtime for its system, copies the program's folder into the app
(not its databases, nor subfolders that are programs of their own), builds the app, and
with `--run` installs and opens it on a running simulator, emulator or connected phone.
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
command line.

### Where the program runs: `platform()`

[`platform()`](/docs/reference/platform/) tells a program where it runs, as a map: the
system and its version, the kind of device and its model, whether it is a simulator or
an emulator, and how the program runs (`"mobile"` in a phone app, `"app"` in `quillo
app`, `"server"` otherwise). In a phone app the app adds what only it knows: the screen,
the memory, the locale and the app's own name and version. It runs on the server, so a
component asks for it through a `server fn`:

```quillo noexec
server fn device() = platform()

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
pages, and only on them, and a component calls it with `js()`:

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
        <button @click={locate}>Where am I?</button>
        {place != null && <p>{place.lat}, {place.lon} ±{place.accuracy} m</p>}
        {note != null && <p class="note">{note}</p>}
    </div>
}
```

Where the two web views differ, as a page in each found:

| | iOS | Android |
|---|---|---|
| `navigator.geolocation` | asks again, in the name of `127.0.0.1`: use the app's location | granted with the app's location permission |
| `capture` on a file input | the camera | the camera (the app opens it), else the photo picker |
| Motion and orientation | only after a tap of the person's own | events without asking |
| `navigator.vibrate`, `getBattery`, `connection` | not there (the app's calls stand in) | there; vibration only after a tap |
| `navigator.wakeLock` | refused (the app's `keepAwake` works) | there |
| `speechSynthesis` | there | not in the web view |
| Bluetooth, USB, Serial, HID | not there | not there |
| The clipboard | only from a tap | only from a tap, in a focused page |

### When the app leaves the screen

**iOS** suspends an app soon after it leaves the screen, and the program's server with
it. A `schedule` job does not run while the app is away; when the app comes back, a job
whose time passed runs once, not once per missed run, and then keeps its schedule.

**Android** lets the app keep running behind the home screen: the server goes on
answering and a job every minute went on running while the app was away. The system can
still stop the process later to save memory or battery; the program starts again from
its database when the app is opened.

Work that must happen while the app is closed needs the system's own means (background
tasks, push notifications), which the runtime does not offer yet.

### What a phone build leaves out

| | |
|---|---|
| Compiled numbers | no JIT on phones: number-heavy functions run in the interpreter |
| WebTransport | channels to pages use the WebSocket |
| `.qwer` plugins built at run time | a phone has no compiler |
| Starting processes | `--instances`, `--split` and `--with`: the app is one process |

### An example: Fieldbook

[Fieldbook](https://github.com/quillolang/quillo/tree/main/mobile/examples/fieldbook) is a
field notebook built to try all of this on a phone: a note with the place from the app,
the compass, a photo with a thumbnail made on the phone by `image.convert`, a voice memo,
and the weather at that place from a web API; a page that tries 35 things a phone can do
and keeps the answers; a page of what `platform()` says; a job every minute; a CSV
export. It runs unchanged on iOS and Android. What it found on iOS is written up in
[FEEDBACK18.md](https://github.com/quillolang/quillo/blob/main/feedback/reports/FEEDBACK18.md).
