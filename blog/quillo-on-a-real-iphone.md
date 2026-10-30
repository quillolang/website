---
title: The route that reached an iPhone
date: 2026-10-31
summary: A Quillo program now runs on a real iPhone: the runtime inside the app, routes served on the phone itself, and real GPS, compass, camera and microphone, with no change to the program.
tags: ios, mobile
---
`route GET /` was written to answer a browser. Last night one answered a web view a few centimetres away, inside the same app, on an iPhone 17 Pro Max, with no network involved.

Nothing about the route changed. It got a request on `127.0.0.1` and replied, as it does on our server. The program is called Fieldbook, a field notebook of about 640 lines, and the note it saved that night had a real GPS position, a compass heading, a three-second voice memo, and the weather at that spot.

### How it works

There is no second framework, no bridge language and no rewrite. The Quillo runtime is compiled for iOS and linked into a small Swift app. When the app opens, the program starts inside it and listens on `127.0.0.1`, and the app's web view opens the first page:

```quillo
route GET /notes = <NoteList notes={load_notes()}/>

route GET /notes/:id(int) = match load_note(id) {
    null => respond(404, "No such note")
    n => <NoteView n={n}/>
}
```

Because the server is on the phone, the app works offline, and its SQLite database stays in the app's own storage. Only the app's web view gets in: the first address carries a token, and another app reaching the port gets 403. The update on Fieldbook's Device page reached the program and was answered in under a millisecond of server time.

For what a web view cannot reach, the app puts `window.quilloNative` on the program's pages, and a component calls it like any other page function:

```quillo
component Spot() {
    state place = null
    let locate = () => {
        place = js("quilloNative.location")   // the phone's GPS
        js("quilloNative.haptic", "success")
    }
    <div>
        <button @click={locate}>Where am I?</button>
        {place != null && <p>{place.lat}, {place.lon}</p>}
    </div>
}
```

The call gives a Promise, and Quillo waits for it. If the person refused, it is an error value with the reason, as with anything else that can fail.

### What a simulator cannot tell you

We had already run Fieldbook in the iOS simulator, with a page that tries 35 things a phone can do and keeps the answers. On the real phone, the same page asked 37 questions and got 26 yeses, 1 refusal, 10 "not here" and no errors.

The differences were the interesting part. A simulator has no compass and no battery, and its camera is a mock. It also refused things we had written down as limits of iOS:

| | iOS simulator | Real iPhone |
|---|---|---|
| Compass | none | a real heading |
| Motion events in 1.5 s | 0 | 88 |
| Camera | a mock device | the phone's own cameras |
| Battery | unknown | 80%, charging |
| `navigator.wakeLock` | refused | held, then released |
| Clipboard write | refused | written |

Reading the clipboard is still refused, and Bluetooth, NFC, USB and vibration from a page are not in WebKit on either. We corrected [the guide](/docs/phone-apps/) the same night. The lesson is an old one: test on the thing itself.

A real photo went through too: 2.3 MB from the camera, kept in the app, with a 26 KB thumbnail made on the phone by `image.convert`, with no outside tool.

### No paid account needed to try it

You don't need an Apple Developer subscription to run this on your own phone. A free Apple ID can sign an app for your own device, though it stops launching after seven days until you install it again. With the certificate and profile Xcode makes for you:

```sh
mobile/ios/build.sh path/to/program --device --run
```

A small `app.toml` beside your `main.qwe` gives the app its name, id, version and icon. The steps are in [the Phone apps guide](/docs/phone-apps/#on-your-own-iphone).

### What this is not, yet

Phone apps are in preview, and we'd rather say exactly how far that goes:

- **No store release yet.** The build makes an archive with what App Store Connect looks for, but nothing has been signed for the store or uploaded.
- **One iPhone, for one night.** It has run on one phone, by one person.
- **A bug we're chasing.** Tabs have stopped responding on the phone after the app had been away, while the page kept updating. We suspect iOS is taking the server's socket while the app is suspended, and we're testing that.
- **Android has only run on an emulator.** The same program runs there unchanged, but it hasn't been on a real Android phone.
- **No work in the background.** iOS pauses the app, and the program with it, when it leaves the screen.

Everything Fieldbook found, including what we got wrong, is in [the report](https://github.com/quillolang/quillo/blob/main/feedback/reports/FEEDBACK18.md).

Web pages started as one machine asking another for a document. It turns out that idea fits inside a phone, with a compass attached.
