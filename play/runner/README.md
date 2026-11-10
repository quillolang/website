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
`/tmp/quillo-play-<pid>`), `--slots`, `--ide-url`, `--idle`, `--max-runtime`, `--runs-per-hour`,
and the limits below (`--max-preview-conns 512`, `--max-slot-conns 48`, `--max-api-conns 128`,
`--upstream-idle 120`, `--ws-idle 600`, `--enter-ttl 60` in seconds, `--ended-budget 16777216`
in bytes, `--max-per-network 3`). SIGINT or SIGTERM stops every program and removes the folder.

## The API (proxy, for the website)

Every request needs `Authorization: Bearer $PLAY_SECRET`; answers are JSON and close the
connection.

- `POST /run` `{"files": {"main.qwe": "...", "lib/x.qwe": "..."}, "client": "u12" | "ip:1.2.3.4"}`
  → `{"session", "host", "enter", "log": [{"n", "text"}], "next", "running", "exit"}`.
  `enter` is the link for the editor's frame: it carries an enter token of its own, good once,
  for 60 seconds; `session` (the cookie's value, and what /log and /stop take) is in no URL, and
  the enter token is in no answer but this one. One session per client (a second run ends the
  first and takes its slot); the client is the exact address (`ip:2001:db8::1` however it is
  written, `ip:1.2.3.4`) or the account (`u12`). Its network (an IPv6 address's /64; an IPv4
  address or an account is its own) may start 30 runs an hour (429 past it) and have 3 sessions
  at once (429 "too many runs from your network"), so a whole office or school behind one /64
  gets a session each, but one visitor cannot fill the slots with the /64's many addresses. An
  IPv4-mapped address is its IPv4 address. 503 when all slots are taken, and once the runner is
  stopping; 400 for files it does not take (at most 30, 256 KB in
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
`/log` poll, on `/stop`, when its program exits, or when the runner restarts or is stopped
(on SIGTERM the proxy starts no more runs, then stops every slot, each after any start in
progress there). Ended sessions' output is kept 10 minutes, at most 16 MB
of it in all (the oldest goes first). A start that failed, or whose answer timed out, is
stopped; every 2 seconds, a program running in a slot no session holds is stopped too.
The spawner is never asked anything while the session table is locked, so a slow answer of
its holds up no preview.

## Previews (proxy, from Limer)

The page puts `enter` (`https://s07.play.quillolang.org/__play/enter?t=ENTER`) in its frame.
That clears the host's storage and cache from earlier sessions (`Clear-Site-Data: "cache",
"storage"`; not `"cookies"`, which would clear every quillolang.org cookie) and redirects to
`/__play/enter2?t=ENTER`, which uses ENTER up, sets `__Host-play` (HttpOnly, Secure,
SameSite=Lax) to the session's token and redirects to `/`. Both steps refuse (403) a request
whose `Sec-Fetch-Dest` is anything but `iframe` (a browser that sends none is let in), an ENTER
older than 60 seconds, and one used already. After that, every request must carry the cookie:
without it, 403. A request with `Service-Worker: script` is refused (403): a service worker
would outlive its session on the host and see the next session's link before the network does.
At most 512 preview connections at once, and 48 for one preview: past that, 503. On the way
to the program:

- `__Host-play` is taken out of `Cookie`; the program never sees it.
- `Connection: close` is added (a WebSocket upgrade keeps its headers), so Limer never sends a
  second request, maybe another host's, down the same connection.
- The body is sent as long as its `Content-Length` says, and nothing after it (a second request
  in the same write goes nowhere); `Transfer-Encoding` is refused (411), and a WebSocket request
  with a body (400).
- The connection goes when it has carried nothing, either way, for its limit: before the answer
  starts, 120 seconds, counted only from the end of the request's body (a slow upload is no idle
  program); once the answer has started (an event stream's pauses) and for a WebSocket, 10
  minutes, one clock for both directions, so a WebSocket the program alone speaks on lives.
- `X-Forwarded-For` is Limer's, passed on (in dev mode, the TCP peer's); the program is started
  with `--trust-proxy 127.0.0.1`.
- A GET or HEAD with no body is sent again once when the program closes without a byte of
  answer, which quillo does now and then under load.

On the way back, each response head is parsed as strictly as a request's (else 502), and
loses `Clear-Site-Data`, the `Domain` of a `Set-Cookie`, any `Set-Cookie` of `__Host-play`,
quillo's `X-Frame-Options: SAMEORIGIN`, the program's `Cache-Control` and `Expires`, and (but
on a 101) its `Connection` and `Keep-Alive`; it gains
`Content-Security-Policy: frame-ancestors https://quillolang.org` (only the editor may frame
it), `Cache-Control: no-store` and `Connection: close`. A body is sent as long as its
`Content-Length` says and no longer (a second answer on the connection never reaches the
browser), or to the end when it gives none. A 101 is relayed only for a request that asked to
become a WebSocket and says `Upgrade: websocket`; then the frames pass as they are. Request heads
are parsed strictly: a bare CR or LF, a folded line, a space before a colon, two Hosts, two
lengths, or a length with Transfer-Encoding are refused.

**What the proxy cannot do: previews are the same site as quillolang.org.** By the user's
choice, preview hosts are subdomains of quillolang.org, not a domain of their own. A
`Set-Cookie` header loses its `Domain`, but a preview page's own script can still set a cookie
for all of quillolang.org with `document.cookie`, which the proxy never sees. What that allows:
a program a visitor runs can fill their browser with cookies for quillolang.org, until the
site's requests are too large to be taken (the visitor clears the site's cookies to get back
in), and every `Domain=quillolang.org` cookie the site might set is sent to every preview.
What it does not: the site's sign-in cookie is `__Host-quillo_session`, which no subdomain can
set or overwrite, and quillo refuses form posts from another origin, a sibling subdomain
included. So the site sets no `Domain` cookies, and the editor says to run only programs from
people you trust.

## The spawner's socket

`/run/quillo-play/spawner.sock` (folder 0750 root:quillo-play, socket 0660), only for uid 0 and
the proxy's user. One JSON line in, one JSON line out:

```
{"op":"start","slot":"s07","files":{...}}      {"ok":true} | {"ok":false,"error":"..."}
{"op":"connect","slot":"s07"}                  {"ok":true} + the connected socket (SCM_RIGHTS)
{"op":"status","slots":["s01","s02"]}          {"ok":true,"status":{"s01":{"running":..,"exit":..,"result":..}}}
{"op":"log","slot":"s07","offset":N,"max":M}   {"ok":true,"data64":"<base64>","next":N2,"size":S}
{"op":"stop","slot":"s07"}                     {"ok":true}
```

Slots are only `s01`..`sNN` from its own list; the files are checked again here. `start` writes
them into a new `/var/lib/quillo-play/src/sNN/` (0750 root:quillo-play-sNN, files 0640, made with
O_EXCL and O_NOFOLLOW), removes the last run's output, and starts `quillo-play-sNN.service`.
`connect` opens `work/app.sock` inside `/proc/<MainPID>/root` with `openat2`
(RESOLVE_NO_SYMLINKS, RESOLVE_BENEATH), so a link the program put there is not followed; checks it
is a socket owned by the slot's user; connects; and checks with SO_PEERCRED that the listener is
the slot's user in the slot's unit. Only then is the socket handed over. The MainPID is kept
from `start`: systemd is asked again only when that process is gone, and a slot whose connect
failed is not tried again for 250 ms. `log` sends the output's bytes as base64, whole. On
start (and on SIGTERM) every slot's unit is stopped and its files removed. The spawner's unit
keeps only the capabilities it needs (CHOWN, FOWNER, DAC_OVERRIDE, DAC_READ_SEARCH,
SYS_PTRACE).

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
| `TemporaryFileSystem=/tmp:size=16m` and `/var/tmp:size=16m` | filling the host's disk: PrivateTmp's folders are on it, with no limit but each file's; these are memory, counted in `MemoryMax` |
| `PrivateDevices=yes`, `TemporaryFileSystem=/dev/shm:size=8m` and `/dev/pts:ro`, `DevicePolicy=strict` with `DeviceAllow=` null, zero, full, random, urandom | the host's devices, its shared memory, and its pty pool (everyone's): the cgroup's device filter refuses any other device |
| `noexec,nosuid,nodev` on every tmpfs it can write (`/work`, `/tmp`, `/var/tmp`, `/dev/shm`), `TemporaryFileSystem=/usr/local:ro` | running anything it wrote; the host's own tools in /usr/local. (`NoExecPaths=`, `ExecPaths=` and `InaccessiblePaths=` were tried first: with `RootDirectory=` they did not reach inside the sandbox, as the server's probe showed.) |
| `PrivateIPC=yes`, `RemoveIPC=yes` | System V IPC with the rest of the server |
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
