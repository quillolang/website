// An nsqd and an nsqlookupd for the nsq plugin's test, written from NSQ's documents
// (nsq.io/clients/tcp_protocol_spec.html, nsq.io/components/nsqd.html and nsqlookupd.html):
// nsqd's HTTP API on `port` (pub with defer, mpub newline and binary, topic and channel create,
// stats, ping; errors as {"message": ...} with 400), its TCP protocol on port + 1 (magic "  V2",
// IDENTIFY with feature negotiation, SUB, RDY, FIN, REQ, TOUCH, NOP, CLS, PUB, MPUB, DPUB;
// frames [size][type][data], messages [timestamp][attempts][16-byte id][body]; heart-beats a
// client must answer with NOP; a message not finished in msg_timeout sent again; every channel
// a copy of each message, shared by its clients by their RDY), and nsqlookupd's /lookup on port + 2.
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";

const NAME = /^[.a-zA-Z0-9_-]+(#ephemeral)?$/;
const okName = (n) => typeof n === "string" && n.length >= 1 && n.length <= 64 && NAME.test(n);

export async function start({ port }) {
    const topics = new Map();   // name -> { name, waiting: [msg], channels: Map, count }
    const clients = new Set();
    const seen = { pub: 0, mpub: 0, dpub: 0, lookup: 0, IDENTIFY: 0, SUB: 0, RDY: 0, FIN: 0, REQ: 0, TOUCH: 0, NOP: 0, CLS: 0, errors: [] };
    let nextId = 1;
    const now = () => Date.now();

    const topic = (name) => {
        if (!topics.has(name)) topics.set(name, { name, waiting: [], channels: new Map(), count: 0 });
        return topics.get(name);
    };
    const channel = (t, name) => {
        if (!t.channels.has(name)) {
            t.channels.set(name, { name, queue: [], inflight: new Map(), deferred: [], count: 0, requeues: 0, timeouts: 0 });
            // Messages that came before the first channel go to it.
            for (const m of t.waiting.splice(0)) for (const ch of t.channels.values()) ch.queue.push({ ...m });
        }
        return t.channels.get(name);
    };
    function publish(name, body, deferMs = 0) {
        const t = topic(name);
        t.count++;
        const id = Buffer.alloc(16);
        id.write(String(nextId++).padStart(16, "0").slice(-16), "ascii");
        const m = { id: id.toString("ascii"), body: Buffer.from(body), ts: BigInt(now()) * 1000000n, attempts: 0 };
        if (!t.channels.size) { t.waiting.push(m); return; }
        for (const ch of t.channels.values()) {
            ch.count++;
            if (deferMs > 0) ch.deferred.push({ m: { ...m }, at: now() + deferMs }); else ch.queue.push({ ...m });
        }
        pump();
    }

    function frame(c, type, data) {
        const d = Buffer.isBuffer(data) ? data : Buffer.from(data);
        const h = Buffer.alloc(8);
        h.writeUInt32BE(d.length + 4, 0); h.writeUInt32BE(type, 4);
        if (c.sock.writable) c.sock.write(Buffer.concat([h, d]));
    }
    const respond = (c, s) => frame(c, 0, s);
    const fail = (c, code, text, fatal = true) => { seen.errors.push(code); frame(c, 1, `${code} ${text}`); if (fatal) { c.sock.end(); c.dead = true; } };

    function pump() {
        const t = now();
        for (const tp of topics.values()) for (const ch of tp.channels.values()) {
            for (const d of ch.deferred.filter((d) => d.at <= t)) ch.queue.push(d.m);
            ch.deferred = ch.deferred.filter((d) => d.at > t);
            for (const [id, f] of ch.inflight) if (f.until <= t) { ch.inflight.delete(id); f.client.inflight.delete(id); ch.timeouts++; ch.queue.push(f.m); }
            const subs = [...clients].filter((c) => c.sub && c.sub.topic === tp.name && c.sub.channel === ch.name && !c.closing);
            let moved = true;
            while (ch.queue.length && moved) {
                moved = false;
                for (const c of subs) {
                    if (!ch.queue.length) break;
                    if (c.inflight.size >= c.rdy) continue;
                    const m = ch.queue.shift();
                    m.attempts++;
                    const head = Buffer.alloc(26);
                    head.writeBigInt64BE(m.ts, 0); head.writeUInt16BE(m.attempts, 8); head.write(m.id, 10, "ascii");
                    ch.inflight.set(m.id, { m, client: c, until: t + c.msgTimeout });
                    c.inflight.set(m.id, ch);
                    frame(c, 2, Buffer.concat([head, m.body]));
                    moved = true;
                }
            }
        }
    }
    const timer = setInterval(() => {
        pump();
        const t = now();
        for (const c of clients) {
            if (!c.identified || c.heartbeat <= 0) continue;
            if (t - c.lastBeat >= c.heartbeat) {
                if (c.unanswered >= 2) { seen.errors.push("heart-beats unanswered"); c.sock.destroy(); continue; }
                respond(c, "_heartbeat_"); c.lastBeat = t; c.unanswered++;
            }
        }
    }, 25);

    function command(c, line, body) {
        const w = line.split(" ");
        const cmd = w[0];
        if (seen[cmd] !== undefined && typeof seen[cmd] === "number") seen[cmd]++;
        switch (cmd) {
            case "IDENTIFY": {
                let v;
                try { v = JSON.parse(body.toString()); } catch { return fail(c, "E_BAD_BODY", "IDENTIFY failed to decode JSON body"); }
                const hb = v.heartbeat_interval ?? 30000;
                if (hb !== -1 && (hb < 1000 || hb > 60000)) return fail(c, "E_BAD_BODY", `IDENTIFY heartbeat interval (${hb}) is invalid`);
                const mt = v.msg_timeout ?? 60000;
                if (mt < 1000 || mt > 900000) return fail(c, "E_BAD_BODY", `IDENTIFY msg timeout (${mt}) is invalid`);
                c.heartbeat = hb; c.msgTimeout = mt; c.identified = true; c.clientId = v.client_id; c.hostname = v.hostname; c.userAgent = v.user_agent;
                if (!v.feature_negotiation) return respond(c, "OK");
                return respond(c, JSON.stringify({ max_rdy_count: 2500, version: "1.3.0-standin", max_msg_timeout: 900000, msg_timeout: mt, tls_v1: false, deflate: false, deflate_level: 0, max_deflate_level: 6, snappy: false, sample_rate: 0, auth_required: false, output_buffer_size: 16384, output_buffer_timeout: 250 }));
            }
            case "SUB": {
                if (c.sub) return fail(c, "E_INVALID", "cannot SUB in current state");
                if (!okName(w[1])) return fail(c, "E_BAD_TOPIC", `SUB topic name "${w[1]}" is not valid`);
                if (!okName(w[2])) return fail(c, "E_BAD_CHANNEL", `SUB channel name "${w[2]}" is not valid`);
                channel(topic(w[1]), w[2]);
                c.sub = { topic: w[1], channel: w[2] };
                respond(c, "OK");
                return pump();
            }
            case "RDY": {
                const n = Number(w[1]);
                if (!Number.isInteger(n) || n < 0 || n > 2500) return fail(c, "E_INVALID", `RDY count ${w[1]} out of range 0-2500`);
                c.rdy = n; return pump();
            }
            case "FIN": case "TOUCH": case "REQ": {
                const ch = c.inflight.get(w[1]);
                if (!ch) return fail(c, `E_${cmd}_FAILED`, `${cmd} ${w[1]} failed: message not in flight`, false);
                const f = ch.inflight.get(w[1]);
                if (cmd === "TOUCH") { f.until = now() + c.msgTimeout; return; }
                ch.inflight.delete(w[1]); c.inflight.delete(w[1]);
                if (cmd === "REQ") {
                    const delay = Number(w[2]);
                    if (!Number.isInteger(delay) || delay < 0) return fail(c, "E_INVALID", `REQ timeout ${w[2]} out of range`);
                    ch.requeues++;
                    if (delay > 0) ch.deferred.push({ m: f.m, at: now() + delay }); else ch.queue.push(f.m);
                }
                return pump();
            }
            case "NOP": c.unanswered = 0; return;
            case "CLS": c.closing = true; return respond(c, "CLOSE_WAIT");
            case "PUB": case "DPUB": {
                if (!okName(w[1])) return fail(c, "E_BAD_TOPIC", `${cmd} topic name "${w[1]}" is not valid`);
                if (!body.length) return fail(c, "E_BAD_MESSAGE", `${cmd} invalid message body size 0`);
                publish(w[1], body, cmd === "DPUB" ? Number(w[2]) : 0);
                return respond(c, "OK");
            }
            case "MPUB": {
                const n = body.readUInt32BE(0); let at = 4;
                for (let i = 0; i < n; i++) { const len = body.readUInt32BE(at); publish(w[1], body.subarray(at + 4, at + 4 + len)); at += 4 + len; }
                return respond(c, "OK");
            }
            default: return fail(c, "E_INVALID", `invalid command ${cmd}`);
        }
    }

    const tcp = createServer((sock) => {
        const c = { sock, buf: Buffer.alloc(0), magic: false, rdy: 0, inflight: new Map(), heartbeat: 30000, msgTimeout: 60000, lastBeat: now(), unanswered: 0, identified: false };
        clients.add(c);
        sock.on("data", (d) => {
            c.unanswered = 0;
            c.buf = Buffer.concat([c.buf, d]);
            if (!c.magic) {
                if (c.buf.length < 4) return;
                if (c.buf.subarray(0, 4).toString() !== "  V2") { fail(c, "E_BAD_PROTOCOL", "client sent an invalid protocol magic"); return; }
                c.magic = true; c.buf = c.buf.subarray(4);
            }
            for (;;) {
                if (c.dead) return;
                const nl = c.buf.indexOf(0x0a);
                if (nl < 0) return;
                const line = c.buf.subarray(0, nl).toString().replace(/\r$/, "");
                const cmd = line.split(" ")[0];
                let body = Buffer.alloc(0), used = nl + 1;
                if (["IDENTIFY", "PUB", "MPUB", "DPUB", "AUTH"].includes(cmd)) {
                    if (c.buf.length < nl + 5) return;
                    const size = c.buf.readUInt32BE(nl + 1);
                    if (c.buf.length < nl + 5 + size) return;
                    body = c.buf.subarray(nl + 5, nl + 5 + size); used = nl + 5 + size;
                }
                c.buf = c.buf.subarray(used);
                command(c, line, body);
            }
        });
        sock.on("error", () => {});
        sock.on("close", () => {
            clients.delete(c);
            for (const [id, ch] of c.inflight) { const f = ch.inflight.get(id); ch.inflight.delete(id); if (f) ch.queue.push(f.m); }
            pump();
        });
    });

    const bad = (res, msg) => { res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ message: msg })); };
    const ok = (res, text = "OK") => { res.writeHead(200, { "content-type": "text/plain" }); res.end(text); };
    const http = createHttp((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", () => {
            const u = new URL(req.url, "http://x");
            const q = Object.fromEntries(u.searchParams);
            const body = Buffer.concat(chunks);
            const p = u.pathname;
            if (p === "/ping") return ok(res);
            if (p === "/pub" || p === "/mpub") {
                if (req.method !== "POST" && req.method !== "PUT") { res.writeHead(405); return res.end(JSON.stringify({ message: "METHOD_NOT_ALLOWED" })); }
                if (!q.topic) return bad(res, "MISSING_ARG_TOPIC");
                if (!okName(q.topic)) return bad(res, "INVALID_TOPIC");
                if (p === "/pub") {
                    if (!body.length) return bad(res, "MSG_EMPTY");
                    let defer = 0;
                    if (q.defer != null) { defer = Number(q.defer); if (!Number.isInteger(defer) || defer < 0 || defer > 3600000) return bad(res, "INVALID_DEFER"); seen.dpub++; } else seen.pub++;
                    publish(q.topic, body, defer);
                    return ok(res);
                }
                seen.mpub++;
                const msgs = [];
                if (q.binary === "true" || q.binary === "1") {
                    if (body.length < 4) return bad(res, "BAD_BODY");
                    const n = body.readUInt32BE(0); let at = 4;
                    for (let i = 0; i < n; i++) {
                        if (at + 4 > body.length) return bad(res, "BAD_BODY");
                        const len = body.readUInt32BE(at);
                        if (!len || at + 4 + len > body.length) return bad(res, "BAD_MESSAGE");
                        msgs.push(body.subarray(at + 4, at + 4 + len)); at += 4 + len;
                    }
                    if (at !== body.length) return bad(res, "BAD_BODY");
                } else msgs.push(...body.toString().split("\n").filter(Boolean).map((s) => Buffer.from(s)));
                msgs.forEach((m) => publish(q.topic, m));
                return ok(res);
            }
            if (p === "/topic/create") { if (!okName(q.topic)) return bad(res, q.topic ? "INVALID_TOPIC" : "MISSING_ARG_TOPIC"); topic(q.topic); return ok(res, ""); }
            if (p === "/channel/create") {
                if (!okName(q.topic)) return bad(res, q.topic ? "INVALID_TOPIC" : "MISSING_ARG_TOPIC");
                if (!okName(q.channel)) return bad(res, q.channel ? "INVALID_CHANNEL" : "MISSING_ARG_CHANNEL");
                channel(topic(q.topic), q.channel); return ok(res, "");
            }
            if (p === "/stats") {
                const list = [...topics.values()].filter((t) => !q.topic || t.name === q.topic).map((t) => ({
                    topic_name: t.name, depth: t.waiting.length, backend_depth: 0, message_count: t.count, paused: false,
                    channels: [...t.channels.values()].map((ch) => ({
                        channel_name: ch.name, depth: ch.queue.length, backend_depth: 0, in_flight_count: ch.inflight.size, deferred_count: ch.deferred.length,
                        message_count: ch.count, requeue_count: ch.requeues, timeout_count: ch.timeouts, paused: false,
                        clients: [...clients].filter((c) => c.sub?.topic === t.name && c.sub?.channel === ch.name).map((c) => ({ client_id: c.clientId, hostname: c.hostname, user_agent: c.userAgent, ready_count: c.rdy, in_flight_count: c.inflight.size })),
                    })),
                }));
                res.writeHead(200, { "content-type": "application/json" });
                return res.end(JSON.stringify({ version: "1.3.0-standin", health: "OK", start_time: Math.floor(now() / 1000), topics: list, memory: {}, producers: [] }));
            }
            res.writeHead(404, { "content-type": "application/json" }); res.end(JSON.stringify({ message: "NOT_FOUND" }));
        });
    });

    const lookupd = createHttp((req, res) => {
        const u = new URL(req.url, "http://x");
        const json = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
        if (u.pathname === "/ping") { res.writeHead(200); return res.end("OK"); }
        if (u.pathname === "/lookup") {
            seen.lookup++;
            const name = u.searchParams.get("topic");
            if (!name) return json(400, { message: "MISSING_ARG_TOPIC" });
            const t = topics.get(name);
            if (!t) return json(404, { message: "TOPIC_NOT_FOUND" });
            return json(200, { channels: [...t.channels.keys()], producers: [{ remote_address: `127.0.0.1:${port + 1}`, hostname: "standin", broadcast_address: "127.0.0.1", tcp_port: port + 1, http_port: port, version: "1.3.0-standin" }] });
        }
        if (u.pathname === "/topics") return json(200, { topics: [...topics.keys()] });
        json(404, { message: "NOT_FOUND" });
    });

    await Promise.all([
        new Promise((r) => http.listen(port, "127.0.0.1", r)),
        new Promise((r) => tcp.listen(port + 1, "127.0.0.1", r)),
        new Promise((r) => lookupd.listen(port + 2, "127.0.0.1", r)),
    ]);
    return {
        env: { NSQD_HTTP_URL: `http://127.0.0.1:${port}`, NSQD_TCP_ADDRESS: `127.0.0.1:${port + 1}`, NSQLOOKUPD_URL: `http://127.0.0.1:${port + 2}`, NSQ_HEARTBEAT_MS: "1000" },
        close() { clearInterval(timer); for (const c of clients) c.sock.destroy(); http.close(); tcp.close(); lookupd.close(); },
        async check() {
            for (let i = 0; i < 30 && !seen.NOP; i++) await new Promise((r) => setTimeout(r, 100));
            const missing = ["pub", "mpub", "dpub", "lookup", "IDENTIFY", "SUB", "RDY", "FIN", "REQ", "TOUCH", "NOP"].filter((k) => !seen[k]);
            if (missing.length) return `the NSQ stand-in never got: ${missing.join(", ")}`;
            return seen.errors.length ? `the NSQ stand-in sent errors: ${seen.errors.join(", ")}` : null;
        },
    };
}
