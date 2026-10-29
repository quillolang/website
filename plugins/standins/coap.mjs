// A greenhouse controller speaking CoAP, for the coap plugin's test, on node:dgram, written
// from RFC 7252 (messages, options, piggybacked and separate responses, duplicate detection),
// RFC 7959 (Block2 and Block1), RFC 7641 (Observe) and RFC 6690 (/.well-known/core).
//
//   /.well-known/core   its resources in link format (filtered by ?rt=...)
//   /sensors/temp       text, observable: a notification every 150 ms, every third confirmable
//   /sensors/humidity   JSON
//   /config             JSON: GET, PUT (JSON only, else 4.15), DELETE; POST is 4.05
//   /actuators/valve    POST "open" or "close": an empty ACK first, the answer 300 ms later
//   /logs/today         3000 bytes of text, sent in blocks of 256 (or smaller when asked)
//   /firmware           PUT in blocks (Block1, 2.31 Continue), 2.04 with the size taken
//   /flaky              the first copy of each request is "lost": answered on the retry
import { createSocket } from "node:dgram";

const CON = 0, NON = 1, ACK = 2, RST = 3;
function decode(b) {
    if (b.length < 4 || b[0] >> 6 !== 1) throw new Error("not CoAP version 1");
    const type = (b[0] >> 4) & 3, tkl = b[0] & 15;
    const m = { type, code: b[1], mid: b.readUInt16BE(2), token: b.subarray(4, 4 + tkl), opts: [], payload: Buffer.alloc(0) };
    let i = 4 + tkl, num = 0;
    while (i < b.length) {
        if (b[i] === 0xff) { m.payload = b.subarray(i + 1); break; }
        let d = b[i] >> 4, l = b[i] & 15; i++;
        if (d === 13) d = 13 + b[i++]; else if (d === 14) { d = 269 + b.readUInt16BE(i); i += 2; } else if (d === 15) throw new Error("reserved delta");
        if (l === 13) l = 13 + b[i++]; else if (l === 14) { l = 269 + b.readUInt16BE(i); i += 2; } else if (l === 15) throw new Error("reserved length");
        num += d; m.opts.push([num, b.subarray(i, i + l)]); i += l;
    }
    return m;
}
function encode({ type, code, mid, token = Buffer.alloc(0), opts = [], payload = Buffer.alloc(0) }) {
    const parts = [Buffer.from([0x40 | (type << 4) | token.length, code, mid >> 8, mid & 255]), token];
    let last = 0;
    for (const [n, v] of [...opts].sort((a, b) => a[0] - b[0])) {
        const d = n - last; last = n;
        const nib = (x) => (x < 13 ? x : x < 269 ? 13 : 14), ext = (x) => (x < 13 ? [] : x < 269 ? [x - 13] : [(x - 269) >> 8, (x - 269) & 255]);
        parts.push(Buffer.from([(nib(d) << 4) | nib(v.length), ...ext(d), ...ext(v.length)]), v);
    }
    if (payload.length) parts.push(Buffer.from([0xff]), payload);
    return Buffer.concat(parts);
}
const uint = (n) => { const out = []; while (n > 0) { out.unshift(n & 255); n = Math.floor(n / 256); } return Buffer.from(out); };
const num = (v) => [...v].reduce((a, x) => a * 256 + x, 0);
const opt = (m, n) => m.opts.find((o) => o[0] === n)?.[1];
const opts = (m, n) => m.opts.filter((o) => o[0] === n).map((o) => o[1].toString());
const block = (v) => { const x = num(v); return { num: Math.floor(x / 16), more: !!(x & 8), size: 1 << ((x & 7) + 4) }; };
const blockOpt = (n, more, size) => uint(n * 16 + (more ? 8 : 0) + (Math.log2(size) - 4));
const C = (c, d) => (c << 5) | d;

// Binds a UDP socket, trying again for a few seconds while the port is still held (the
// previous example may not have let go of it yet).
function bindUdp(sock, port, host = "127.0.0.1") {
    return new Promise((resolve, reject) => {
        let tries = 0;
        const attempt = () => {
            const onError = (e) => {
                sock.off("listening", onListening);
                if (e.code === "EADDRINUSE" && ++tries < 40) setTimeout(attempt, 100);
                else reject(e);
            };
            const onListening = () => { sock.off("error", onError); resolve(); };
            sock.once("error", onError);
            sock.once("listening", onListening);
            sock.bind(port, host);
        };
        attempt();
    });
}

export async function start({ port }) {
    const seen = { gets: 0, observers: 0, deregistered: 0, notifications: 0, acked: 0, block2: 0, block1: 0, separate: 0, separateAcked: 0, retried: 0, problems: [] };
    const sock = createSocket("udp4");
    const send = (m, r) => sock.send(encode(m), r.port, r.address);
    let config = { interval_s: 60, target_c: 22.0 };
    let temp = 21.5, obsSeq = 2, mid = 1000;
    const watchers = new Map(); // "addr:port|token" -> { r, token }
    const recent = new Map(); // duplicate detection: "addr:port|mid" -> the response sent
    const lostOnce = new Set();
    const uploads = new Map();
    const log = Array.from({ length: 60 }, (_, i) => `08:${String(i).padStart(2, "0")} zone ${(i % 4) + 1} ok, ${(20 + (i % 7) * 0.3).toFixed(1)} C`).join("\n").padEnd(3000, ".").slice(0, 3000);
    const links = [
        '</sensors/temp>;rt="temperature-c";if="sensor";ct=0;obs;title="Air temperature"',
        '</sensors/humidity>;rt="humidity";if="sensor";ct=50',
        '</config>;rt="config";ct=50',
        '</actuators/valve>;rt="valve";if="actuator"',
        `</logs/today>;ct=0;sz=${3000}`,
        '</firmware>;rt="firmware"',
    ];
    // notifications: every 150 ms, every third one confirmable (and so acknowledged)
    const timer = setInterval(() => {
        temp = Math.round((temp + 0.1) * 10) / 10;
        obsSeq++;
        for (const [k, w] of watchers) {
            const type = obsSeq % 3 === 0 ? CON : NON;
            const m = { type, code: C(2, 5), mid: (mid = (mid + 1) & 0xffff), token: w.token, opts: [[6, uint(obsSeq & 0xffffff)], [12, uint(0)], [14, uint(5)]], payload: Buffer.from(String(temp)) };
            if (type === CON) w.pending.add(m.mid);
            send(m, w.r);
            seen.notifications++;
        }
    }, 150);

    sock.on("message", (b, r) => {
        let m;
        try { m = decode(b); } catch (e) { seen.problems.push(`a datagram that is not CoAP: ${e.message}`); return; }
        const key = `${r.address}:${r.port}`;
        if (m.type === ACK || m.type === RST) {
            for (const [k, w] of watchers) {
                if (!k.startsWith(key)) continue;
                if (w.pending.delete(m.mid)) { if (m.type === ACK) seen.acked++; else { watchers.delete(k); seen.deregistered++; } }
            }
            if (m.type === ACK && separateWaiting.has(`${key}|${m.mid}`)) { separateWaiting.delete(`${key}|${m.mid}`); seen.separateAcked++; }
            return;
        }
        if (m.code === 0) { if (m.type === CON) send({ type: RST, code: 0, mid: m.mid }, r); return; } // a ping
        if (m.code >= 32) { seen.problems.push("a response sent to the server"); return; }
        const dup = recent.get(`${key}|${m.mid}`);
        if (dup) { sock.send(dup, r.port, r.address); return; } // a retransmission: the same answer again
        const path = "/" + opts(m, 11).join("/");
        const query = opts(m, 15);
        if (path === "/flaky" && !lostOnce.has(`${key}|${m.mid}`)) { lostOnce.add(`${key}|${m.mid}`); return; }
        if (path === "/flaky") seen.retried++;
        const answer = (code, payload = "", more = []) => {
            const out = encode({ type: m.type === CON ? ACK : NON, code, mid: m.type === CON ? m.mid : (mid = (mid + 1) & 0xffff), token: m.token, opts: more, payload: Buffer.isBuffer(payload) ? payload : Buffer.from(payload) });
            recent.set(`${key}|${m.mid}`, out);
            if (recent.size > 500) recent.delete(recent.keys().next().value);
            sock.send(out, r.port, r.address);
        };
        const method = m.code;
        if (method === 1) seen.gets++;
        if (path === "/.well-known/core" && method === 1) {
            const f = query.find((q) => q.startsWith("rt="))?.slice(3);
            return answer(C(2, 5), links.filter((l) => !f || l.includes(`rt="${f}"`)).join(","), [[12, uint(40)]]);
        }
        if (path === "/sensors/temp" && method === 1) {
            const o = opt(m, 6);
            const wkey = `${key}|${m.token.toString("hex")}`;
            if (o !== undefined && num(o) === 0) { watchers.set(wkey, { r, token: Buffer.from(m.token), pending: new Set() }); seen.observers++; return answer(C(2, 5), String(temp), [[6, uint(obsSeq)], [12, uint(0)], [14, uint(5)]]); }
            if (o !== undefined && num(o) === 1) { if (watchers.delete(wkey)) seen.deregistered++; }
            return answer(C(2, 5), String(temp), [[12, uint(0)], [14, uint(5)]]);
        }
        if (path === "/sensors/humidity" && method === 1) return answer(C(2, 5), JSON.stringify({ rh: 48, dew_point_c: 10.2 }), [[12, uint(50)]]);
        if (path === "/config") {
            if (method === 1) return config ? answer(C(2, 5), JSON.stringify(config), [[12, uint(50)], [4, Buffer.from("c0f1")]]) : answer(C(4, 4), "no configuration");
            if (method === 3) {
                if (num(opt(m, 12) ?? Buffer.alloc(0)) !== 50) return answer(C(4, 15), "send application/json");
                try { config = JSON.parse(m.payload.toString()); } catch { return answer(C(4, 0), "not JSON"); }
                return answer(C(2, 4));
            }
            if (method === 4) { config = null; return answer(C(2, 2)); }
            return answer(C(4, 5), "GET, PUT or DELETE");
        }
        if (path === "/actuators/valve" && method === 2) {
            const want = m.payload.toString();
            if (want !== "open" && want !== "close") return answer(C(4, 0), 'send "open" or "close"');
            if (m.type !== CON) return answer(C(2, 4), `valve ${want}ed`.replace("closeed", "closed"));
            // a separate response: the empty ACK now, the answer when the valve has moved
            send({ type: ACK, code: 0, mid: m.mid }, r);
            seen.separate++;
            setTimeout(() => {
                const smid = (mid = (mid + 1) & 0xffff);
                separateWaiting.add(`${key}|${smid}`);
                send({ type: CON, code: C(2, 4), mid: smid, token: m.token, opts: [[12, uint(0)]], payload: Buffer.from(want === "open" ? "valve opened" : "valve closed") }, r);
            }, 300);
            return;
        }
        if (path === "/logs/today" && method === 1) {
            const b2 = opt(m, 23);
            const req = b2 ? block(b2) : { num: 0, size: 256 };
            const size = Math.min(req.size, 256), start = req.num * req.size;
            if (start >= log.length) return answer(C(4, 2), "no such block");
            const n = Math.floor(start / size), part = log.slice(n * size, n * size + size), more = n * size + size < log.length;
            seen.block2++;
            return answer(C(2, 5), part, [[12, uint(0)], [23, blockOpt(n, more, size)], [28, uint(log.length)], [4, Buffer.from("1094")]]);
        }
        if (path === "/firmware" && (method === 3 || method === 2)) {
            const b1 = opt(m, 27);
            if (!b1) return answer(C(2, 4), `took ${m.payload.length} bytes`);
            const { num: n, more, size: asked } = block(b1);
            const size = Math.min(asked, 512); // this device takes at most 512 per block
            if (asked > size) return answer(C(4, 13), "", [[27, blockOpt(0, false, size)]]);
            const u = uploads.get(key) ?? { parts: [], size };
            if (n === 0) { u.parts = []; u.size = size; }
            if (n !== u.parts.length) return answer(C(4, 8), "a block is missing");
            u.parts.push(Buffer.from(m.payload)); uploads.set(key, u);
            seen.block1++;
            if (more) return answer(C(2, 31), "", [[27, blockOpt(n, true, size)]]);
            const total = Buffer.concat(u.parts).length; uploads.delete(key);
            return answer(C(2, 4), `took ${total} bytes`, [[27, blockOpt(n, false, size)]]);
        }
        if (path === "/flaky" && method === 1) return answer(C(2, 5), "made it");
        if (["/sensors/temp", "/sensors/humidity", "/logs/today", "/.well-known/core", "/actuators/valve", "/firmware", "/flaky"].includes(path)) return answer(C(4, 5), "method not allowed here");
        answer(C(4, 4), `no resource at ${path}`);
    });
    const separateWaiting = new Set();
    await bindUdp(sock, port);
    return {
        env: { COAP_DEVICE: `coap://127.0.0.1:${port}`, COAP_LISTEN_PORT: String(port + 1) },
        close: () => { clearInterval(timer); sock.close(); },
        check: () => {
            if (seen.problems.length) return `the CoAP stand-in saw: ${[...new Set(seen.problems)].join("; ")}`;
            if (!seen.observers || !seen.acked) return `observe: ${seen.observers} registrations, ${seen.acked} confirmable notifications acknowledged`;
            if (seen.block2 < 2 || seen.block1 < 2) return `block-wise: ${seen.block2} Block2 and ${seen.block1} Block1 messages`;
            if (!seen.separateAcked) return "the separate response was never acknowledged";
            if (!seen.retried) return "the lost request was never sent again";
            return null;
        },
    };
}
