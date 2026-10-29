// Runs each plugin's example and asks it what catalog.json says to try.
//
//   node plugins/test.mjs [slug ...]          QUILLO=/path/to/quillo to pick the binary
//
// CATALOG=catalog-x.json tests another list; PORT_BASE=20000 moves its ports, so several
// runs can go at once.
//
// Each example is started with `quillo run <slug>.qwe` (which builds its .qwer file the
// first time), each `try` request is made, and its answer must be a 2xx holding `expect`.
// A plugin that `needs` a server gets a small stand-in: an SMTP sink or a Redis.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const quillo = process.env.QUILLO ?? join(here, "../../quillo/target/release/quillo");
const catalog = JSON.parse(readFileSync(join(here, process.env.CATALOG ?? "catalog.json"), "utf8"));
const BASE = Number(process.env.PORT_BASE ?? 18700);
const only = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// An SMTP server that takes every message and keeps it, for the smtp plugin.
const mail = [];
function smtpSink(port) {
    return createServer((s) => {
        let data = false, buf = "";
        s.write("220 sink ESMTP\r\n");
        s.on("data", (d) => {
            buf += d.toString();
            let i;
            while ((i = buf.indexOf("\r\n")) >= 0) {
                const line = buf.slice(0, i); buf = buf.slice(i + 2);
                if (data) { if (line === ".") { data = false; s.write("250 kept\r\n"); } else mail.push(line); continue; }
                const cmd = line.slice(0, 4).toUpperCase();
                if (cmd === "EHLO") s.write("250-sink\r\n250 8BITMIME\r\n");
                else if (cmd === "DATA") { data = true; s.write("354 go on\r\n"); }
                else if (cmd === "QUIT") { s.write("221 bye\r\n"); s.end(); }
                else s.write("250 ok\r\n");
            }
        });
    }).listen(port, "127.0.0.1");
}

// An HTTP server that answers every request with 201 and `{"ok":true}`, and keeps what
// it got: for plugins that send webhooks or pushes.
const received = [];
function httpSink(port) {
    return createHttpServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => { received.push({ method: req.method, url: req.url, headers: req.headers, body }); res.writeHead(201, { "content-type": "application/json" }); res.end('{"ok":true}'); });
    }).listen(port, "127.0.0.1");
}

// A Redis that knows GET, SET (with EX), DEL, INCR, EXPIRE and PING, for the redis plugin.
function redisStandIn(port) {
    const kv = new Map();
    const bulk = (v) => (v == null ? "$-1\r\n" : `$${Buffer.byteLength(v)}\r\n${v}\r\n`);
    return createServer((s) => {
        let buf = Buffer.alloc(0);
        s.on("data", (d) => {
            buf = Buffer.concat([buf, d]);
            for (;;) {
                const text = buf.toString("latin1");
                if (!text.startsWith("*")) return;
                let at = text.indexOf("\r\n"); if (at < 0) return;
                const n = Number(text.slice(1, at)); let pos = at + 2; const args = [];
                for (let k = 0; k < n; k++) {
                    const e = text.indexOf("\r\n", pos); if (e < 0) return;
                    const len = Number(text.slice(pos + 1, e)); pos = e + 2;
                    if (text.length < pos + len + 2) return;
                    args.push(buf.subarray(pos, pos + len).toString()); pos += len + 2;
                }
                buf = buf.subarray(pos);
                const [c, k, v] = [args[0].toUpperCase(), args[1], args[2]];
                if (c === "PING") s.write("+PONG\r\n");
                else if (c === "GET") s.write(bulk(kv.get(k)));
                else if (c === "SET") { kv.set(k, v); s.write("+OK\r\n"); }
                else if (c === "DEL") { const had = kv.delete(k); s.write(`:${had ? 1 : 0}\r\n`); }
                else if (c === "INCR") { const x = Number(kv.get(k) ?? 0) + 1; kv.set(k, String(x)); s.write(`:${x}\r\n`); }
                else if (c === "EXPIRE") s.write(":1\r\n");
                else s.write(`-ERR unknown command ${c}\r\n`);
            }
        });
    }).listen(port, "127.0.0.1");
}

let port = BASE, failed = 0, passed = 0;
for (const p of catalog.filter((p) => only.length === 0 || only.includes(p.slug))) {
    port += 1;
    const env = { ...process.env, ...(p.env ?? {}) };
    const helpers = [];
    if (p.needs === "smtp") { helpers.push(smtpSink(BASE + 990)); env.SMTP_URL = `smtp://127.0.0.1:${BASE + 990}`; env.SMTP_FROM = "Shop <shop@example.com>"; }
    if (p.needs === "redis") { helpers.push(redisStandIn(BASE + 991)); env.REDIS_URL = `redis://127.0.0.1:${BASE + 991}/`; }
    if (p.needs === "http") { received.length = 0; helpers.push(httpSink(BASE + 992)); env.SINK_URL = `http://127.0.0.1:${BASE + 992}`; }
    const child = spawn(quillo, ["run", `${p.slug}.qwe`, "--port", String(port), "--log", "off"], { cwd: here, env });
    let out = "";
    child.stdout.on("data", (d) => (out += d)); child.stderr.on("data", (d) => (out += d));
    const base = `http://127.0.0.1:${port}`;
    let up = false;
    for (let i = 0; i < 1200 && !up && child.exitCode == null; i++) {
        await sleep(250);
        up = await fetch(base + "/__none").then(() => true, () => false);
    }
    const problems = [];
    if (!up) problems.push(`did not start:\n${out.slice(-2000)}`);
    for (const t of up ? p.try : []) {
        const r = await fetch(base + t.path, t.body != null ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(t.body) } : {})
            .then(async (r) => ({ status: r.status, text: await r.text() }), (e) => ({ status: 0, text: String(e) }));
        if (r.status < 200 || r.status > 299 || !r.text.includes(t.expect)) problems.push(`${t.path} -> ${r.status} ${r.text.slice(0, 300)} (expected ${JSON.stringify(t.expect)})`);
    }
    if (p.needs === "smtp" && up && !mail.some((l) => l.startsWith("Subject:"))) problems.push("the SMTP sink got no message");
    if (p.needs === "http" && up && received.length === 0) problems.push("the HTTP sink got no request");
    // Every plugin says its version, on the second line of its header.
    const head = readFileSync(join(here, `${p.slug}.qwer`), "utf8").split("\n").slice(0, 3).join("\n");
    if (!/^\/\/! version: \d+\.\d+\.\d+$/m.test(head)) problems.push("no `//! version: X.Y.Z` line at the top of the file");
    child.kill(); helpers.forEach((h) => h.close());
    if (problems.length) { failed++; console.log(`FAIL ${p.slug}\n  ${problems.join("\n  ")}`); } else { passed++; console.log(`ok   ${p.slug}`); }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
