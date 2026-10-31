# Hosting

A Quillo program in production is one process, `quillo run main.qwe`, answering HTTP on a
port. Hosting it takes four things: a machine that can keep a process running, a proxy in
front for HTTPS, a few environment variables, and a database on a disk that lasts. This
page goes through each, with a checklist at the end.

### What the server needs

| | |
|---|---|
| **The `quillo` binary** | One file of 20 to 25 MB, nothing else: SQLite and the time zone database are built in, and TLS is rustls, not OpenSSL. Build it on (or for) the same system and CPU as the server: a Linux binary built on a newer distribution than the server's may not start there |
| **The program's files** | `main.qwe` and the files it uses, `migrations/`, `public/` |
| **Rust files, built** | A program with [`.qwer` files](/docs/rust/) builds them the first time it starts, which needs Rust. Run `quillo build main.qwe` beforehand on the same kind of machine, and deploy `.quillo/native/` with the program: the server then needs no Rust |
| **A long-running process** | Any VPS, cloud VM or container service. Shared hosting that runs only PHP cannot run it; see [static hosting](#static-hosting) |

Quillo needs no Node, no package install and no build step on the server.

### Running it

```sh
quillo run main.qwe --port 8080 --log json
```

| Option | In production |
|---|---|
| `--port N` | the port (default `$PORT`, then 8080) |
| `--host H` | the address to listen on. The default, `127.0.0.1`, takes connections from this machine only, which is right behind a proxy on the same machine. `0.0.0.0` in a container |
| `--instances N` | the program N times over, a core each (see [several cores](#several-cores-several-servers)) |
| `--log json` | a JSON line per request, for log collectors |
| `--reload` | reload when the program's files change, without dropping requests (see [new versions](#new-versions)) |
| `--max-body N` | the largest request body, in bytes (default 10 MiB): raise it for big uploads |
| `--base /shop` | when the program is served under a path rather than at the root: its links, redirects, scripts and cookies carry the prefix, and the proxy strips it from requests (Quillo routes the path it is given) |
| `--metrics` | answer `/_quillo/metrics` (keep it private: see below) |

Never `--watch` in production: it shows errors on pages, refreshes them, and leaves
`Secure` off cookies, since it expects plain HTTP on your own machine.

### Environment

| Variable | What for |
|---|---|
| `QUILLO_SECRET` | the key that signs sessions. **Set it**: without it a key is made at start, and every restart signs everyone out. A long random string (`crypto.token()` makes one), the same on every server |
| `PORT` | the port, when `--port` is not given |
| `DATABASE_URL`, or any name | read with `env("DATABASE_URL")` in the program |
| `QUILLO_DB` | the database when the program does not call `db.open` |
| `QUILLO_SYSTEM_DB` | where Quillo keeps its own tables when each tenant has a database |
| `QUILLO_SERVICE_SECRET` | signs calls between [services](/docs/microservices/) split across servers: the same on all of them |
| `QUILLO_SERVICE_<NAME>` | where service NAME runs, as `--service-url` says |
| `LIMER_ADMIN_SECRET` | for `--register`, joining limer's pool |
| `PUBLIC_...` | variables components may read, written into the pages' scripts |

Keep them out of the program's files: in the service manager's environment file, or the
container platform's secrets. `quillo run` also reads a `.env` beside the program (or
`--env-file`), handy on your own machine; a variable the environment has wins over it,
so a `.env` left on a server cannot override production's. There is no other
configuration file.

### The database

```quillo
db.open("data/app.db") | unwrap         // SQLite, in a folder that lasts
db.open(env("DATABASE_URL")) | unwrap   // PostgreSQL or MySQL
db.migrate("migrations")
```

- **End `db.open` with `| unwrap`.** When a database cannot be opened, `db.open` gives an
  error value and the program goes on with SQLite in memory, empty: fine while trying
  things out, a loss of data in production. With `unwrap`, the program stops and says why.
  A program that never calls `db.open` (and has no `QUILLO_DB`) is on SQLite in memory
  too, and loses it all at each restart.
- **SQLite lives in a file**, so it must be on a disk that outlasts the process: a
  volume, in a container. The folder must exist (`mkdir -p data`); a path is counted from
  the main file's folder.
- **Back SQLite up with its own command**, not by copying the file while it runs:
  `sqlite3 data/app.db ".backup backup.db"`.
- **Migrations** run when the program starts, each once, in order.
- `:memory:` is one database per instance: with `--instances`, use a file or PostgreSQL.

### HTTPS: a proxy in front

Quillo answers plain HTTP/1.1: it has no HTTPS or HTTP/2 of its own. A proxy in front
gets the certificate, answers HTTPS, and passes requests on. Session cookies are
`Secure` and named `__Host-quillo_session` (unless `--watch`), so the site must be served
over HTTPS: a browser sends them to `http://localhost`, but `curl` and other cookie jars
do not, so test those under `--watch` or through the proxy.

With [Caddy](https://caddyserver.com), which gets and renews the certificate itself and
passes WebSockets as they are:

```
example.com {
    reverse_proxy 127.0.0.1:8080
}
```

With nginx, add what WebSockets need (live data and channels use them) and the host name
(tenants are told apart by it):

```
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl;
    server_name example.com;
    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 1h;
    }
}
```

- **The visitor's address.** Behind a proxy, `request.ip` is the proxy's. The visitor's
  is in the header the proxy adds, `request.headers["x-forwarded-for"]`. Trust it only
  when Quillo can be reached through the proxy alone: keep `--host 127.0.0.1`.
- **WebTransport** (channels over HTTP/3) goes over UDP, which these proxies do not pass.
  Open the UDP port, the HTTP port's number unless `--wt-port` says another, to the
  server itself: Quillo presents a certificate of its own, which pages take by its hash,
  or yours with `--tls-cert` and `--tls-key`. Otherwise pages use a WebSocket, which
  works through the proxy; `--no-wt` turns WebTransport off.

### Keeping it running

With systemd, `/etc/systemd/system/app.service`:

```
[Unit]
Description=My Quillo app
After=network.target

[Service]
User=quillo
WorkingDirectory=/srv/app
ExecStart=/usr/local/bin/quillo run main.qwe --port 8080 --log json
EnvironmentFile=/etc/quillo/app.env
Restart=on-failure
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
```

`/etc/quillo/app.env` holds the environment (`QUILLO_SECRET=...`), readable by root only
(`chmod 600`). Then `systemctl enable --now app` starts it now and at every boot, and
`journalctl -u app -f` follows its log.

On `SIGTERM` (what `systemctl stop` and `docker stop` send), Quillo stops taking
connections, answers the requests in progress for up to 10 seconds, and exits with status
0; give the service manager a little longer than that, as `TimeoutStopSec=15` does.

### In a container

A Dockerfile that builds `quillo` from its source, then runs the program in a small image
as a user of its own, with the database on a volume:

```
FROM rust:1-bookworm AS quillo
RUN cargo install --locked --git https://github.com/quillolang/quillo quillo

FROM debian:bookworm-slim
COPY --from=quillo /usr/local/cargo/bin/quillo /usr/local/bin/quillo
RUN useradd --system --home /app quillo \
 && mkdir -p /app/data && chown quillo /app/data
WORKDIR /app
COPY app/ .
USER quillo
VOLUME /app/data
EXPOSE 8080
CMD ["quillo", "run", "main.qwe", "--host", "0.0.0.0", \
     "--port", "8080", "--log", "json"]
```

```sh
docker build -t my-app .
docker run -d --name my-app -p 127.0.0.1:8080:8080 -v my-app-data:/app/data \
    -e QUILLO_SECRET=... --stop-timeout 15 my-app
```

The program opens its database at `data/app.db`, on the volume, so it outlasts the
container. The first build takes a few minutes (about two on a laptop); later ones reuse
the `quillo` stage while the Dockerfile's first two lines stay the same. The image is
about 170 MB, most of it Debian; `quillo` needs only the C library from it.

### New versions

- **The program's files.** With `--reload`, copying new files over the old ones reloads
  the program: requests in progress finish on the old version, later ones get the new
  one, and none is dropped. A version that fails to load or check does not replace the
  one running; the errors are in the log. Copy all files at once
  (`rsync -a --delay-updates`), so it does not load half of them. Global variables start
  afresh; sessions, being signed cookies, stay valid.
- **A new `quillo`.** Replace the binary and restart the service. Requests in progress
  finish first; new ones are refused for the moment it takes to start again (there is no
  handing the port from one process to the next). With several servers behind a load
  balancer, restart them one at a time. `.qwer` libraries built by an older Quillo may be
  built again, which needs Rust there: run `quillo build` with the new binary first.
- **What a restart keeps.** The database, `quillo-system.db` beside the program, and
  sessions (with `QUILLO_SECRET`). Global variables, channels and what is cached in
  memory start empty.

### Several cores, several servers

- **`--instances N`** runs the program N times in one process, a core each. Each has its
  own variables; the database is shared, and its changes reach live pages on all of them.
- **Several servers** share a database (PostgreSQL or MySQL) and sit behind a load
  balancer. With [limer](https://limer.sh), `--register` joins its pool, so a change made
  through one server wakes live pages on all of them (see
  [Live data](/docs/components/#several-servers)). Use the same `QUILLO_SECRET` on all.
- **Scheduled jobs** run once per due time across servers on one database; `--no-jobs`
  turns them off on a server.

### Health, logs and metrics

- `GET /_quillo/health` answers `200` while the server takes requests, and `503` while it
  stops or when its program failed to load: give it to the load balancer.
- `GET /_quillo/ready` also says whether what the program needs is there (its database,
  its services, checks of its own), 200 or 503 with each part as JSON: give it to an
  orchestrator's readiness probe.
- `--log json` writes a JSON line per request (time, method, path with its query, status,
  ms, ip, tenant, and `rid`, the request's id) on stderr, where systemd's journal or the
  container's log collects it. Errors stay plain text lines (`quillo: ...`). `ip` is the
  proxy's, behind one: Quillo never reads `X-Forwarded-For`.
- `--metrics` answers `GET /_quillo/metrics` in Prometheus's text format. Anyone who can
  reach it can read it, so keep it from the public at the proxy: in nginx,
  `location /_quillo/metrics { deny all; }`; in Caddy, `respond /_quillo/metrics 403`.

### Static hosting

A site whose components call nothing on the server (no `server fn`, database, sessions or
live data) can be rendered to files and put on any static host, shared hosting included.
This site is one: its [export script](https://github.com/quillolang/website/blob/main/export.sh)
runs it, fetches every page its sitemap lists and the component bundles they load, and
writes them to a folder that is uploaded as it is.

### Before going live

- `quillo` built for the server's system; `.qwer` files built with `quillo build`
- `QUILLO_SECRET` set, the same on every server
- `db.open(...) | unwrap`, and SQLite's folder on a disk that lasts, with backups
- HTTPS from a proxy, which passes WebSockets and the `Host` header
- `--host 127.0.0.1` behind a proxy on the same machine; not `--watch`
- a service manager that restarts it, and waits 15 seconds when stopping it
- `/_quillo/health` for the load balancer, `/_quillo/ready` for readiness;
  `/_quillo/metrics` kept private
- `--max-compute 2s`, so one request that computes for ever cannot hold an instance, and
  limits of your own where you need them: Quillo has no rate limiting
