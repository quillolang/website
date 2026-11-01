// STUN servers for stun.qwe, on node:dgram, written from RFC 8489 (and RFC 5769's vectors, used
// to test this file's own HMAC and CRC by eye): the 20-byte header with the magic cookie,
// XOR-MAPPED-ADDRESS, and the long-term mechanism: a request without credentials gets 401 with
// REALM and NONCE, one with them must carry a good MESSAGE-INTEGRITY.
//
//   port      open: answers every Binding request, checks a FINGERPRINT when one comes
//   port + 1  long-term credentials: ada / lovelace; an answer signed
//   port + 2  drops the first two copies of each transaction, to see them sent again
//   port + 3  gives each socket a different mapped port, as a symmetric NAT would
//   port + 4  given to the example for its own server
import { createSocket } from "node:dgram";
import { createHmac, createHash, randomBytes } from "node:crypto";

const MAGIC = 0x2112a442;
function bindUdp(sock, port) {
    return new Promise((resolve, reject) => {
        let tries = 0;
        const attempt = () => {
            const onError = (e) => { sock.off("listening", onListening); if (e.code === "EADDRINUSE" && ++tries < 40) setTimeout(attempt, 100); else reject(e); };
            const onListening = () => { sock.off("error", onError); resolve(); };
            sock.once("error", onError); sock.once("listening", onListening); sock.bind(port, "127.0.0.1");
        };
        attempt();
    });
}
function crc32(b) {
    let c = ~0;
    for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; }
    return ~c >>> 0;
}
function parse(m) {
    if (m.length < 20 || m.readUInt32BE(4) !== MAGIC || m.readUInt16BE(2) !== m.length - 20) return null;
    const attrs = new Map(); let i = 20, integrityAt = -1, fpAt = -1;
    while (i < m.length) {
        const k = m.readUInt16BE(i), n = m.readUInt16BE(i + 2);
        attrs.set(k, m.subarray(i + 4, i + 4 + n));
        if (k === 8) integrityAt = i; if (k === 0x8028) fpAt = i;
        i += 4 + Math.ceil(n / 4) * 4;
    }
    return { type: m.readUInt16BE(0), id: m.subarray(8, 20), attrs, integrityAt, fpAt };
}
function attr(k, v) { const p = Buffer.alloc((4 - v.length % 4) % 4); const h = Buffer.alloc(4); h.writeUInt16BE(k); h.writeUInt16BE(v.length, 2); return Buffer.concat([h, v, p]); }
function message(type, id, attrs, key) {
    let body = Buffer.concat(attrs);
    const head = (n) => { const h = Buffer.alloc(20); h.writeUInt16BE(type); h.writeUInt16BE(n, 2); h.writeUInt32BE(MAGIC, 4); id.copy(h, 8); return h; };
    if (key) { const mac = createHmac("sha1", key).update(head(body.length + 24)).update(body).digest(); body = Buffer.concat([body, attr(8, mac)]); }
    return Buffer.concat([head(body.length), body]);
}
function xorAddr(host, port) {
    const v = Buffer.alloc(8); v[1] = 1; v.writeUInt16BE(port ^ (MAGIC >>> 16), 2);
    host.split(".").forEach((x, i) => { v[4 + i] = Number(x) ^ ((MAGIC >>> (24 - i * 8)) & 255); });
    return v;
}

export async function start({ ports }) {
    const seen = { open: 0, signed: 0, retried: 0, problems: [], fingerprints: 0 };
    const key = createHash("md5").update("ada:quillo.test:lovelace").digest();
    const nonce = randomBytes(8).toString("hex");
    const socks = ports.slice(0, 4).map(() => createSocket("udp4"));
    const reply = (s, from, buf) => s.send(buf, from.port, from.address);

    socks[0].on("message", (m, from) => {
        const p = parse(m);
        if (!p || p.type !== 1) return seen.problems.push("a malformed request");
        seen.open++;
        if (p.fpAt >= 0) {
            seen.fingerprints++;
            const want = (crc32(m.subarray(0, p.fpAt)) ^ 0x5354554e) >>> 0;
            if (p.attrs.get(0x8028).readUInt32BE(0) !== want) return reply(socks[0], from, message(0x111, p.id, [attr(9, Buffer.from([0, 0, 4, 0, ...Buffer.from("Bad Request")]))]));
        }
        reply(socks[0], from, message(0x101, p.id, [attr(0x8022, Buffer.from("stand-in 1.0")), attr(0x20, xorAddr(from.address, from.port))]));
    });
    socks[1].on("message", (m, from) => {
        const p = parse(m);
        if (!p) return seen.problems.push("a malformed request");
        const refuse = (code, why, more = []) => reply(socks[1], from, message(0x111, p.id, [attr(9, Buffer.from([0, 0, Math.floor(code / 100), code % 100, ...Buffer.from(why)])), ...more]));
        const challenge = [attr(0x14, Buffer.from("quillo.test")), attr(0x15, Buffer.from(nonce))];
        if (!p.attrs.has(8)) return refuse(401, "Unauthenticated", challenge);
        if (p.attrs.get(6)?.toString() !== "ada" || p.attrs.get(0x14)?.toString() !== "quillo.test" || p.attrs.get(0x15)?.toString() !== nonce) return refuse(401, "Unknown user", challenge);
        const head = Buffer.from(m.subarray(0, p.integrityAt)); head.writeUInt16BE(p.integrityAt - 20 + 24, 2);
        const mac = createHmac("sha1", key).update(head).digest();
        if (!mac.equals(p.attrs.get(8))) return refuse(401, "Bad integrity", challenge);
        seen.signed++;
        reply(socks[1], from, message(0x101, p.id, [attr(0x20, xorAddr(from.address, from.port))], key));
    });
    const copies = new Map();
    socks[2].on("message", (m, from) => {
        const p = parse(m); if (!p) return;
        const k = p.id.toString("hex"), n = (copies.get(k) ?? 0) + 1; copies.set(k, n);
        if (n < 3) return;
        seen.retried++;
        reply(socks[2], from, message(0x101, p.id, [attr(0x20, xorAddr(from.address, from.port))]));
    });
    socks[3].on("message", (m, from) => {
        const p = parse(m); if (!p) return;
        reply(socks[3], from, message(0x101, p.id, [attr(0x20, xorAddr("203.0.113.9", 40000 + (from.port % 1000)))]));
    });
    await Promise.all(socks.map((s, i) => bindUdp(s, ports[i])));
    const at = (i) => `127.0.0.1:${ports[i]}`;
    return {
        env: { STUN_SERVER: at(0), STUN_OTHER: at(0), STUN_LOCKED: at(1), STUN_DROPPY: at(2), STUN_SHIFTY: at(3), STUN_LISTEN_PORT: String(ports[4]), STUN_SILENT: "127.0.0.1:1" },
        close() { setTimeout(() => socks.forEach((s) => s.close()), 50); },
        check() {
            if (seen.problems.length) return seen.problems[0];
            if (seen.signed === 0) return "no request ever passed the long-term check";
            if (seen.fingerprints === 0) return "no FINGERPRINT was sent";
            if (seen.retried === 0) return "nothing was sent again";
            return null;
        },
    };
}
