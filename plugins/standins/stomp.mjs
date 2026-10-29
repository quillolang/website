// A STOMP 1.2 broker for the stomp plugin's test, written from the specification
// (stomp.github.io/stomp-specification-1.2.html): CONNECT/STOMP with version and heart-beat
// negotiation and a login, frames ended by NUL or sized by content-length, 1.2 header escaping
// (not in CONNECT/CONNECTED), SEND to /queue/ (one subscriber each, kept until one comes) and
// /topic/ (every subscriber), SUBSCRIBE with auto, client (cumulative) and client-individual acks,
// ACK and NACK (sent again, marked redelivered), BEGIN/COMMIT/ABORT holding sends and acks,
// RECEIPT for any frame asking, ERROR then close for a bad frame, heart-beats both ways, and a
// closed connection's unacked messages sent again.
import { createServer } from "node:net";

const USER = "shop", PASS = "s3cret";

export async function start({ port }) {
    const conns = new Set();
    const queues = new Map();   // destination -> [message] waiting for a subscriber
    const seen = { SEND: 0, SUBSCRIBE: 0, ACK: 0, NACK: 0, BEGIN: 0, COMMIT: 0, ABORT: 0, heartbeats: 0, receipts: 0, escaped: 0, errors: [] };
    let nextMsg = 1, rr = 0;

    const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/:/g, "\\c");
    const unesc = (s) => s.replace(/\\(.)/g, (m, c) => ({ r: "\r", n: "\n", c: ":", "\\": "\\" })[c] ?? (() => { throw new Error(`undefined escape ${m}`); })());

    function frame(c, command, headers, body = Buffer.alloc(0)) {
        if (!c.sock.writable) return;
        const plain = command === "CONNECTED";
        const head = [command, ...Object.entries(headers).map(([k, v]) => (plain ? `${k}:${v}` : `${esc(k)}:${esc(v)}`))].join("\n");
        c.sock.write(Buffer.concat([Buffer.from(head + "\n\n"), Buffer.from(body), Buffer.from([0])]));
        c.lastSent = Date.now();
    }
    function error(c, message, detail, receipt) {
        seen.errors.push(message);
        frame(c, "ERROR", { message, ...(receipt ? { "receipt-id": receipt } : {}), "content-type": "text/plain" }, Buffer.from(detail ?? ""));
        c.sock.end();
        c.dead = true;
    }

    function deliver(dest, msg) {
        const subs = [...conns].flatMap((c) => [...c.subs.values()].filter((s) => s.destination === dest).map((s) => ({ c, s })));
        if (dest.startsWith("/topic/")) { for (const { c, s } of subs) send(c, s, { ...msg, id: `m-${nextMsg++}` }); return; }
        if (!subs.length) { if (!queues.has(dest)) queues.set(dest, []); queues.get(dest).push(msg); return; }
        const { c, s } = subs[rr++ % subs.length];
        send(c, s, msg);
    }
    function send(c, s, msg) {
        const h = { subscription: s.id, "message-id": msg.id, destination: msg.destination, ...msg.headers, "content-length": msg.body.length };
        if (msg.redelivered) h.redelivered = "true";
        if (s.ack !== "auto") { const ack = `${msg.id}@${c.session}`; h.ack = ack; c.unacked.push({ ack, sub: s.id, msg }); }
        frame(c, "MESSAGE", h, msg.body);
    }
    function flushQueue(dest) {
        const q = queues.get(dest);
        while (q?.length && [...conns].some((c) => [...c.subs.values()].some((s) => s.destination === dest))) deliver(dest, q.shift());
    }
    function requeue(entry) { deliver(entry.msg.destination, { ...entry.msg, redelivered: true }); }

    function doAck(c, id, nack) {
        const i = c.unacked.findIndex((u) => u.ack === id);
        if (i < 0) return false;
        const sub = c.subs.get(c.unacked[i].sub);
        // In client mode an ACK covers every message of the subscription sent before it.
        const done = sub?.ack === "client" ? c.unacked.filter((u, j) => j <= i && u.sub === c.unacked[i].sub) : [c.unacked[i]];
        c.unacked = c.unacked.filter((u) => !done.includes(u));
        if (nack) done.forEach(requeue);
        return true;
    }

    function handle(c, f) {
        const h = f.headers;
        if (!c.connected && f.command !== "CONNECT" && f.command !== "STOMP") return error(c, "not connected", "CONNECT first");
        if (seen[f.command] !== undefined) seen[f.command]++;
        const receipt = () => { if (h.receipt != null) { seen.receipts++; frame(c, "RECEIPT", { "receipt-id": h.receipt }); } };
        switch (f.command) {
            case "CONNECT": case "STOMP": {
                if (!(h["accept-version"] ?? "1.0").split(",").includes("1.2")) return error(c, "unsupported version", "Supported protocol versions are 1.2");
                if (!h.host) return error(c, "missing host header", "STOMP 1.2 clients send host");
                if (h.login !== USER || h.passcode !== PASS) return error(c, "bad credentials", `login ${h.login ?? "(none)"} refused`);
                const [cx, cy] = (h["heart-beat"] ?? "0,0").split(",").map(Number);
                const sx = 300, sy = 300; // what this broker can do
                c.sendEvery = cy === 0 ? 0 : Math.max(sx, cy);
                c.expectEvery = cx === 0 ? 0 : Math.max(sy, cx);
                c.connected = true;
                return frame(c, "CONNECTED", { version: "1.2", "heart-beat": `${sx},${sy}`, session: c.session, server: "standin/1.0" });
            }
            case "SEND": {
                if (!h.destination) return error(c, "missing destination", "", h.receipt);
                if (!/^\/(queue|topic)\//.test(h.destination)) return error(c, "unknown destination", `${h.destination}: use /queue/ or /topic/`, h.receipt);
                if (Object.values(h).some((v) => /[:\n]/.test(v))) seen.escaped++;
                const { destination, transaction, receipt: _r, "content-length": _l, ...rest } = h;
                const msg = { id: `m-${nextMsg++}`, destination, headers: rest, body: f.body };
                if (transaction != null) {
                    if (!c.tx.has(transaction)) return error(c, "unknown transaction", transaction, h.receipt);
                    c.tx.get(transaction).push(() => deliver(destination, msg));
                } else deliver(destination, msg);
                return receipt();
            }
            case "SUBSCRIBE": {
                if (!h.id || !h.destination) return error(c, "SUBSCRIBE needs id and destination", "", h.receipt);
                if (c.subs.has(h.id)) return error(c, "duplicate subscription id", h.id, h.receipt);
                const ack = h.ack ?? "auto";
                if (!["auto", "client", "client-individual"].includes(ack)) return error(c, "bad ack mode", ack, h.receipt);
                c.subs.set(h.id, { id: h.id, destination: h.destination, ack });
                receipt();
                return flushQueue(h.destination);
            }
            case "UNSUBSCRIBE": {
                if (!c.subs.delete(h.id)) return error(c, "no such subscription", h.id ?? "", h.receipt);
                return receipt();
            }
            case "ACK": case "NACK": {
                if (!h.id) return error(c, `${f.command} needs id`, "", h.receipt);
                const run = () => doAck(c, h.id, f.command === "NACK");
                if (h.transaction != null) {
                    if (!c.tx.has(h.transaction)) return error(c, "unknown transaction", h.transaction, h.receipt);
                    c.tx.get(h.transaction).push(run);
                } else if (!run()) return error(c, "no such message to ack", h.id, h.receipt);
                return receipt();
            }
            case "BEGIN": {
                if (!h.transaction || c.tx.has(h.transaction)) return error(c, "bad or repeated transaction", h.transaction ?? "", h.receipt);
                c.tx.set(h.transaction, []);
                return receipt();
            }
            case "COMMIT": case "ABORT": {
                const t = c.tx.get(h.transaction);
                if (!t) return error(c, "unknown transaction", h.transaction ?? "", h.receipt);
                c.tx.delete(h.transaction);
                if (f.command === "COMMIT") t.forEach((fn) => fn());
                return receipt();
            }
            case "DISCONNECT": receipt(); c.sock.end(); return;
            default: return error(c, "unknown command", f.command);
        }
    }

    function parse(c) {
        for (;;) {
            let i = 0;
            while (i < c.buf.length && (c.buf[i] === 0x0a || c.buf[i] === 0x0d)) i++;
            if (i) { seen.heartbeats++; c.buf = c.buf.subarray(i); }
            const end = c.buf.indexOf("\n\n");
            if (end < 0) return;
            const head = c.buf.subarray(0, end).toString().split("\n").map((l) => l.replace(/\r$/, ""));
            const command = head[0];
            const headers = {};
            try {
                for (const l of head.slice(1)) {
                    const k = l.indexOf(":");
                    if (k < 0) throw new Error(`header without a colon: ${l}`);
                    const name = command === "CONNECT" || command === "STOMP" ? l.slice(0, k) : unesc(l.slice(0, k));
                    const value = command === "CONNECT" || command === "STOMP" ? l.slice(k + 1) : unesc(l.slice(k + 1));
                    if (!(name in headers)) headers[name] = value;  // the first of a repeated header wins
                }
            } catch (e) { return error(c, "malformed frame", e.message); }
            const start = end + 2;
            let body, next;
            if (headers["content-length"] != null) {
                const n = Number(headers["content-length"]);
                if (c.buf.length < start + n + 1) return;
                if (c.buf[start + n] !== 0) return error(c, "malformed frame", "no NUL after content-length bytes");
                body = c.buf.subarray(start, start + n); next = start + n + 1;
            } else {
                const z = c.buf.indexOf(0, start);
                if (z < 0) return;
                body = c.buf.subarray(start, z); next = z + 1;
            }
            c.buf = c.buf.subarray(next);
            handle(c, { command, headers, body: Buffer.from(body) });
            if (c.dead) return;
        }
    }

    let sessions = 0;
    const server = createServer((sock) => {
        const c = { sock, buf: Buffer.alloc(0), subs: new Map(), unacked: [], tx: new Map(), connected: false, session: `s${++sessions}`, lastHeard: Date.now(), lastSent: Date.now(), sendEvery: 0, expectEvery: 0 };
        conns.add(c);
        sock.on("data", (d) => { c.lastHeard = Date.now(); c.buf = Buffer.concat([c.buf, d]); parse(c); });
        sock.on("error", () => {});
        sock.on("close", () => {
            conns.delete(c);
            const back = c.unacked; c.unacked = [];
            back.forEach(requeue);
        });
    });
    const beat = setInterval(() => {
        const t = Date.now();
        for (const c of conns) {
            if (!c.connected) continue;
            if (c.sendEvery && t - c.lastSent >= c.sendEvery) { c.sock.write("\n"); c.lastSent = t; }
            if (c.expectEvery && t - c.lastHeard > c.expectEvery * 3) { seen.errors.push("heart-beat missed"); c.sock.destroy(); }
        }
    }, 50);
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { STOMP_URL: `stomp://127.0.0.1:${port}`, STOMP_USER: USER, STOMP_PASSWORD: PASS, STOMP_HEARTBEAT_MS: "500" },
        close() { clearInterval(beat); for (const c of conns) c.sock.destroy(); server.close(); },
        async check() {
            // An idle client sends a heart-beat within its interval (500 ms here).
            for (let i = 0; i < 30 && !seen.heartbeats; i++) await new Promise((r) => setTimeout(r, 100));
            const missing = ["SEND", "SUBSCRIBE", "ACK", "NACK", "BEGIN", "COMMIT", "ABORT", "receipts", "heartbeats", "escaped"].filter((k) => !seen[k]);
            if (missing.length) return `the STOMP stand-in never saw: ${missing.join(", ")}`;
            const unexpected = seen.errors.filter((e) => e !== "unknown destination");
            return unexpected.length ? `the STOMP stand-in sent ERROR frames: ${unexpected.join("; ")}` : null;
        },
    };
}
