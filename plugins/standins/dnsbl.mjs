// A DNS server with blocklists for the dnsbl plugin's test, written from RFC 1035 and RFC 5782 (DNS
// blocklists: 127.0.0.2 is always listed, 127.0.0.1 never, IPv6 by reversed nibbles): real packets
// over UDP with name compression in the answers, and over TCP with the length prefix for a TXT that
// is marked truncated on UDP. zen.spamhaus.org answers 127.0.0.2 with 127.0.0.4 and a TXT record,
// bl.spamcop.net answers 127.0.0.2, dbl.spamhaus.org the DBL code 127.0.1.2 for bad-domain.test,
// multi.uribl.com the mask 127.0.0.14, public.example the 127.255.255.254 "public resolver" code,
// broken.example SERVFAIL, silent.example nothing at all. An unknown name is NXDOMAIN.
//
//   start({ port }) -> { env: { DNSBL_SERVER }, close(), check() }
import { createSocket } from "node:dgram";
import { createServer } from "node:net";

const LONG = "Listed by the test: see https://example.test/lookup for details. ".repeat(12);
const NIBBLES = "2.0.0.0.0.0.f.7.f.f.f.f.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0";

export async function start({ port }) {
    const stats = { udp: 0, tcp: 0, txt: 0, nibbles: 0, questions: [] };
    function readName(m, at) {
        const parts = [];
        for (;;) { const n = m[at]; if (n === 0) return [parts.join("."), at + 1]; parts.push(m.subarray(at + 1, at + 1 + n).toString()); at += 1 + n; }
    }
    function records(name, type) {
        const zone = ["zen.spamhaus.org", "bl.spamcop.net", "b.barracudacentral.org", "dbl.spamhaus.org", "multi.surbl.org", "multi.uribl.com", "public.example", "own.example"].find((z) => name.endsWith("." + z));
        if (!zone) return null;
        const left = name.slice(0, -zone.length - 1);
        if (type === 16) {
            if (zone === "zen.spamhaus.org" && (left === "2.0.0.127" || left === NIBBLES)) { stats.txt++; return { txt: LONG, truncate: true }; }
            return null;
        }
        if (type !== 1) return null;
        if (zone === "public.example") return { a: ["127.255.255.254"] };
        if (left === "2.0.0.127") {
            if (zone === "zen.spamhaus.org") return { a: ["127.0.0.2", "127.0.0.4"] };
            if (zone === "own.example") return { a: ["127.0.0.9"] };
            if (zone === "bl.spamcop.net") return { a: ["127.0.0.2"] };
            return null;
        }
        if (left === NIBBLES && zone === "zen.spamhaus.org") { stats.nibbles++; return { a: ["127.0.0.3"] }; }
        if (left === "bad-domain.test" && zone === "dbl.spamhaus.org") return { a: ["127.0.1.2"] };
        if (left === "bad-domain.test" && zone === "multi.uribl.com") return { a: ["127.0.0.14"] };
        return null;
    }
    function answer(q, tcp) {
        if (q.length < 12 || q[2] & 0x80 || !(q[2] & 1)) return null;
        const [name, end] = readName(q, 12);
        const type = q.readUInt16BE(end);
        stats.questions.push(`${type} ${name}`);
        if (name.endsWith("silent.example")) return null;
        const r = records(name, type);
        const failed = name.endsWith("broken.example");
        const question = q.subarray(12, end + 4);
        const head = Buffer.alloc(12);
        q.copy(head, 0, 0, 2);
        head[2] = 0x81; head[3] = 0x80 | (failed ? 2 : r ? 0 : 3);
        head.writeUInt16BE(1, 4);
        if (r?.truncate && !tcp) { head[2] |= 2; return Buffer.concat([head, question]); }
        const rrs = [];
        const rr = (t, data) => { const b = Buffer.alloc(12); b.writeUInt16BE(0xc00c, 0); b.writeUInt16BE(t, 2); b.writeUInt16BE(1, 4); b.writeUInt32BE(60, 6); b.writeUInt16BE(data.length, 10); rrs.push(b, data); };
        for (const a of r?.a ?? []) rr(1, Buffer.from(a.split(".").map(Number)));
        if (r?.txt) { const chunks = []; for (let i = 0; i < r.txt.length; i += 255) { const c = Buffer.from(r.txt.slice(i, i + 255)); chunks.push(Buffer.from([c.length]), c); } rr(16, Buffer.concat(chunks)); }
        head.writeUInt16BE(rrs.length / 2, 6);
        return Buffer.concat([head, question, ...rrs]);
    }
    const udp = createSocket("udp4");
    udp.on("message", (m, from) => { stats.udp++; const a = answer(m, false); if (a) udp.send(a, from.port, from.address); });
    await new Promise((r) => udp.bind(port, "127.0.0.1", r));
    const tcp = createServer((s) => {
        let buf = Buffer.alloc(0);
        s.on("data", (d) => {
            buf = Buffer.concat([buf, d]);
            if (buf.length < 2 || buf.length < 2 + buf.readUInt16BE(0)) return;
            stats.tcp++;
            const a = answer(buf.subarray(2, 2 + buf.readUInt16BE(0)), true);
            const len = Buffer.alloc(2); len.writeUInt16BE(a.length);
            s.end(Buffer.concat([len, a]));
        });
        s.on("error", () => {});
    });
    await new Promise((r) => tcp.listen(port, "127.0.0.1", r));
    return {
        env: { DNSBL_SERVER: `127.0.0.1:${port}` },
        close() { setTimeout(() => udp.close(), 50); tcp.close(); },
        check: () => (!stats.udp ? "no DNS question came" : !stats.tcp ? "the truncated answer was not asked for over TCP" : !stats.nibbles ? "no IPv6 lookup came" : null),
    };
}
