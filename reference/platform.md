# platform
platform() -> map
group: General

### What it does

Where the program runs, as a map. The runtime reads it from the system once, and in a
phone app the app's launcher adds what only it knows. A component cannot call it: it
runs on the server, as `env` does, so a page asks through a `server fn`.

| Field | Says |
|---|---|
| `os` | `"ios"`, `"android"`, `"macos"`, `"linux"`, `"windows"`, `"freebsd"` |
| `os_name`, `os_version` | the system's own name and version: `"iOS"` and `"27.0"`, `"macOS"` and `"15.5"`, `"Ubuntu"` and `"24.04"` |
| `kernel` | the kernel's release |
| `device` | `"phone"` (`"tablet"` on an iPad), `"desktop"` (in `quillo app`) or `"server"` |
| `model` | the hardware model: `"iPhone19,2"`, `"Mac15,6"`; null when the system does not say |
| `arch`, `cpus` | the processor (`"aarch64"`, `"x86_64"`) and how many cores the program may use |
| `simulator` | `true` in the iOS simulator |
| `runtime` | how the program runs: `"mobile"` in a phone app, `"app"` in `quillo app`, `"server"` |
| `locale`, `time_zone` | `"en-SG"`, `"Asia/Singapore"`; null when unknown |
| `screen` | in a phone app, `{ width, height, scale }` in points; null elsewhere |
| `app` | in a phone app, `{ name, id, version, build }`; null elsewhere |
| `quillo` | Quillo's version, as `quillo --version` says it |

A phone app's launcher may add fields of its own (`memory`, `model_family`).

### Examples

```quillo
let p = platform()
print(p.runtime, p.device, p.simulator)
print(type_of(p.cpus), p.cpus > 0, type_of(p.os_version))
print(p.screen, p.app)
```

```output
server server false
int true str
null null
```

In a page, through a `server fn`:

```quillo noexec
server fn device() = platform()

component About() {
    state p = device()
    <p>{p.os_name} {p.os_version} on {p.model ?? p.arch}{p.simulator ? " (simulator)" : ""}</p>
}
```

### Edge cases

- It is read once, when it is first asked for: the values do not change while the
  program runs.
- In a component, `platform()` is refused by `quillo check`: `` `platform` is not
  available in the browser ``. A `server fn` gives the map to the page.
- A field the system does not tell is null, never missing, so `p.model ?? "unknown"`
  works everywhere.

### See also

[env](/docs/reference/env/), and the [Phone apps](/docs/phone-apps/) guide.
