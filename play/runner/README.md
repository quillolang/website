# quillo-play

The runner behind [quillolang.org/play/](https://quillolang.org/play/): each **Run** in the
online editor starts the real `quillo run --watch` in a sandbox on the server, and its preview
is served at a host of its own, `s01.play.quillolang.org` to `s20.play.quillolang.org`.

One binary, three roles:

| Role | Runs as | What it does |
|---|---|---|
| `spawner` | root, Linux | Makes and stops the sandboxes (transient systemd units), writes a run's files, reads its output, and hands the proxy a connection to a sandbox's socket after checking who listens on it. It never sees a visitor's bytes. |
| `proxy` | user `quillo-play` | The website's API (`127.0.0.1:4311`) and the previews' traffic from Limer (`127.0.0.1:4310`): the host and session cookie are checked, then the request goes to the program. |
| `dev` | you, any OS | Both in one process with **no sandbox**: each run is a plain child process. For working on the editor locally; it listens on 127.0.0.1 only. |

## Dev mode

```sh
cd play/runner && cargo build
PLAY_SECRET=quillo-play-dev-secret ./target/debug/quillo-play dev --quillo ~/.cargo/bin/quillo
```

The API is then at `http://127.0.0.1:4311` (`Authorization: Bearer quillo-play-dev-secret`; that
is also the default when `PLAY_SECRET` is not set), and previews are at
`http://sNN.play.localhost:4310`. Open the editor at a host under `play.localhost`, such as
`http://play.localhost:8080/play/` (`quillo run --watch --allowed-hosts play.localhost`), so the
editor and its previews are one site: the preview's `SameSite=Lax` cookie is sent in its frame,
and `frame-ancestors` (from `--ide-url`, default `http://play.localhost:8080/play/`) lets that
page frame it.

Other settings: `--port-api`, `--port-preview`, `--dir` (where runs go, default
`/tmp/quillo-play-<pid>`), `--slots`, `--ide-url`, `--idle`, `--max-runtime`, `--runs-per-hour`.
SIGINT or SIGTERM stops every program and removes the folder.

## The API (proxy, for the website)

Every request needs `Authorization: Bearer $PLAY_SECRET`; answers are JSON and close the
connection.

- `POST /run` `{"files": {"main.qwe": "...", "lib/x.qwe": "..."}, "client": "u12" | "ip:1.2.3.4"}`
  → `{"session", "host", "enter", "log": [{"n", "text"}], "next", "running", "exit"}`.
  One session per client (a second run ends the first and takes its slot); 429 past 30 runs an
  hour; 503 when all slots are taken; 400 for files it does not take (at most 30, 256 KB in
  all, text only, `main.qwe` there, names of letters, digits, `_ . -`, at most three levels, no
  part `.`, `..` or starting with `.`). It answers once the program's socket is up, the program
  ended, quillo printed `watching for changes` without a socket (an error, now waiting for a
  fix), or 8 seconds passed.
- `GET /log?session=S&after=N` → `{"lines": [{"n", "text"}], "running", "exit", "next"}`, the
  lines after N (64 KB at most; the last 256 KB are kept). A poll counts as the session being
  used. An ended session's output stays readable for 10 minutes, with a last line saying how it
  ended (`[stopped]`, `[stopped: a run may take at most 10 minutes]`, ...).
- `POST /stop` `{"session": S}` → `{}`.
- `GET /health` → `{"slots", "busy"}`.

A session ends 10 minutes after it starts, after 3 minutes with no preview request and no
`/log` poll, on `/stop`, when its program exits, or when the runner restarts.

## Previews (proxy, from Limer)

The page puts `enter` (`https://s07.play.quillolang.org/__play/enter?t=SESSION`) in its frame.
That clears the host's storage, cache and service workers from earlier sessions
(`Clear-Site-Data: "cache", "storage"`; not `"cookies"`, which would clear every
quillolang.org cookie), then sets `__Host-play` (HttpOnly, Secure, SameSite=Lax) and redirects
to `/`. After that, every request must carry that cookie: without it, 403. On the way to the
program:

- `__Host-play` is taken out of `Cookie`; the program never sees it.
- `Connection: close` is added (a WebSocket upgrade keeps its headers), so Limer never sends a
  second request, maybe another host's, down the same connection.
- `X-Forwarded-For` is Limer's, passed on (in dev mode, the TCP peer's); the program is started
  with `--trust-proxy 127.0.0.1`.
- A GET or HEAD with no body is sent again once when the program closes without a byte of
  answer, which quillo does now and then under load.

On the way back, each response head loses `Clear-Site-Data`, the `Domain` of a `Set-Cookie`
(so a program cannot set a cookie for all of quillolang.org), any `Set-Cookie` of `__Host-play`,
and quillo's `X-Frame-Options: SAMEORIGIN`; it gains
`Content-Security-Policy: frame-ancestors https://quillolang.org`, so only the editor may frame
it. Bodies and WebSocket frames pass as they are. Request heads are parsed strictly: a bare CR or
LF, a folded line, a space before a colon, two Hosts, two lengths, or a length with
Transfer-Encoding are refused.

## The spawner's socket

`/run/quillo-play/spawner.sock` (folder 0750 root:quillo-play, socket 0660), only for uid 0 and
the proxy's user. One JSON line in, one JSON line out:

```
{"op":"start","slot":"s07","files":{...}}      {"ok":true} | {"ok":false,"error":"..."}
{"op":"connect","slot":"s07"}                  {"ok":true} + the connected socket (SCM_RIGHTS)
{"op":"status","slots":["s01","s02"]}          {"ok":true,"status":{"s01":{"running":..,"exit":..,"result":..}}}
{"op":"log","slot":"s07","offset":N,"max":M}   {"ok":true,"data":"...","next":N2,"size":S}
{"op":"stop","slot":"s07"}                     {"ok":true}
```

Slots are only `s01`..`sNN` from its own list; the files are checked again here. `start` writes
them into a new `/var/lib/quillo-play/src/sNN/` (0750 root:quillo-play-sNN, files 0640, made with
O_EXCL and O_NOFOLLOW), removes the last run's output, and starts `quillo-play-sNN.service`.
`connect` opens `work/app.sock` inside `/proc/<MainPID>/root` with `openat2`
(RESOLVE_NO_SYMLINKS, RESOLVE_BENEATH), so a link the program put there is not followed; checks it
is a socket owned by the slot's user; connects; and checks with SO_PEERCRED that the listener is
the slot's user in the slot's unit. Only then is the socket handed over. On start (and on
SIGTERM) every slot's unit is stopped and its files removed.

## The sandbox, and what each part is for

`quillo-play-sNN.service` runs `cp -R /src/. /work/ && cd /work && exec /opt/quillo run --watch
--listen unix:/work/app.sock --allowed-hosts sNN.play.quillolang.org --trust-proxy 127.0.0.1
--max-compute 2s --max-body 1MB main.qwe` (src/sandbox.rs). Settings come from the config, never
from a run's files.

| Property | Guards against |
|---|---|
| `User=quillo-play-sNN` (one system user per slot) | one slot's program signalling or reading another's |
| `RootDirectory=/var/lib/quillo-play/root`, `BindReadOnlyPaths=/usr`, its own files at `/src`, quillo at `/opt/quillo` | seeing the server's files: site.db, site.env, Limer's keys, other slots' runs |
| `TemporaryFileSystem=/work:size=32m` | filling the disk; what it writes is memory, counted in `MemoryMax` |
| `PrivateNetwork=yes`, `RestrictAddressFamilies=AF_UNIX`, `IPAddressDeny=any` | any network: no outgoing connections, no reaching 127.0.0.1's services |
| `MemoryMax=192M`, `MemorySwapMax=0`, `OOMScoreAdjust=1000` | using up memory; it is the first thing killed if memory runs short |
| `CPUQuota=50%`, `CPUWeight=10`, `Nice=10`, `IOWeight=10` | taking the CPU or disk from the site |
| `TasksMax=32` | fork bombs |
| `LimitNOFILE=256`, `LimitFSIZE=16M`, `LimitCORE=0` | file-descriptor exhaustion, one huge file or output log, core dumps |
| `RuntimeMaxSec=660` | a run outliving the proxy's 10 minutes |
| `NoNewPrivileges=yes`, `CapabilityBoundingSet=`, `AmbientCapabilities=`, `RestrictSUIDSGID=yes` | gaining privileges (setuid binaries, capabilities) |
| `PrivateUsers=yes` | uids other than its own meaning anything inside |
| `PrivateTmp=yes`, `PrivateDevices=yes`, `PrivateIPC=yes`, `RemoveIPC=yes` | shared /tmp, devices, System V IPC with the rest of the server |
| `ProtectProc=invisible`, `ProcSubset=pid` | seeing other processes and kernel details in /proc |
| `ProtectKernelTunables`, `ProtectKernelModules`, `ProtectKernelLogs`, `ProtectControlGroups`, `ProtectClock`, `ProtectHostname` | changing the kernel, its modules, logs, cgroups, the clock or the host name |
| `RestrictNamespaces=yes` | making namespaces, the way into many kernel bugs |
| `RestrictRealtime=yes`, `LockPersonality=yes` | realtime scheduling that starves the server; personality tricks |
| `MemoryDenyWriteExecute=yes` (with `QUILLO_JIT=0`) | writing machine code and running it |
| `SystemCallArchitectures=native`, `SystemCallFilter=@system-service ~@privileged @resources @mount @swap @reboot @raw-io @module @debug @cpu-emulation @obsolete @keyring`, and `~io_uring_setup io_uring_enter io_uring_register` | system calls a program has no need of; io_uring (in @system-service) reached the kernel in the server's probe, and is a common way into kernel bugs |
| `UMask=0077`, `KeyringMode=private` | its files readable by others; sharing kernel keys |
| `quillo-play.slice` (set up by deploy) | all sandboxes together taking more than their share |

## Tests

`cargo test` runs the unit tests and, with the quillo on this machine (`QUILLO_BIN`, else
`~/.cargo/bin/quillo`; without one they pass without running), real programs through the proxy:
the dev backend straight and behind the spawner's socket, and the binary in dev mode.
`tests/fake.rs` runs the proxy against a fake program. The systemd backend
(`src/systemd.rs`) is type-checked for Linux here (`cargo check --target
x86_64-unknown-linux-gnu`) and its pure parts unit-tested; the sandbox itself is tried on the
server, property by property.
