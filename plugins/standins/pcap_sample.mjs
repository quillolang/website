// Makes the sample captures pcap.qwe reads: `node standins/pcap_sample.mjs` writes pcap_sample.pcap
// and pcap_sample.pcapng beside the plugins. Every packet is made up here, none was captured.
// Addresses are from the documentation ranges. Not a stand-in: nothing starts it in a test.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const b = (...x) => Buffer.from(x.flat());
const u16 = (v) => { const a = Buffer.alloc(2); a.writeUInt16BE(v); return a; };
const u32 = (v) => { const a = Buffer.alloc(4); a.writeUInt32BE(v >>> 0); return a; };
const ip = (s) => Buffer.from(s.split(".").map(Number));
const mac = (s) => Buffer.from(s.split(":").map((x) => parseInt(x, 16)));
const ip6 = (s) => Buffer.from(s, "hex");
const A = "02:00:00:00:00:0a", B = "02:00:00:00:00:0b";

function sum(buf) {
    let s = 0;
    for (let i = 0; i + 1 < buf.length; i += 2) s += buf.readUInt16BE(i);
    if (buf.length % 2) s += buf[buf.length - 1] << 8;
    while (s >> 16) s = (s & 0xffff) + (s >> 16);
    return ~s & 0xffff;
}
function eth(dst, src, type, body, vlans = []) {
    const tags = vlans.map(([tpid, id]) => Buffer.concat([u16(tpid), u16(id)]));
    return Buffer.concat([mac(dst), mac(src), ...tags, u16(type), body]);
}
function ipv4(src, dst, proto, body, { ttl = 64, id = 1, frag = 0 } = {}) {
    const h = Buffer.concat([b(0x45, 0), u16(20 + body.length), u16(id), u16(frag), b(ttl, proto), u16(0), ip(src), ip(dst)]);
    h.writeUInt16BE(sum(h), 10);
    return Buffer.concat([h, body]);
}
const udp = (sp, dp, body) => Buffer.concat([u16(sp), u16(dp), u16(8 + body.length), u16(0), body]);
const tcp = (sp, dp, seq, ack, flags, body = Buffer.alloc(0)) => Buffer.concat([u16(sp), u16(dp), u32(seq), u32(ack), b(0x50, flags), u16(64240), u16(0), u16(0), body]);
const arp = (op, sm, si, tm, ti) => Buffer.concat([u16(1), u16(0x0800), b(6, 4), u16(op), mac(sm), ip(si), mac(tm), ip(ti)]);
const ipv6 = (src, dst, next, body, hops = 64) => Buffer.concat([u32(0x60000000), u16(body.length), b(next, hops), ip6(src), ip6(dst), body]);
const dnsQ = Buffer.concat([u16(0x1234), u16(0x0100), u16(1), u16(0), u16(0), u16(0), b(7), Buffer.from("example"), b(3), Buffer.from("com"), b(0), u16(1), u16(1)]);

const H1 = "192.0.2.10", H2 = "198.51.100.20";
const S6 = "20010db8000000000000000000000001", D6 = "20010db8000000000000000000000002";
const frames = [
    eth("ff:ff:ff:ff:ff:ff", A, 0x0806, arp(1, A, H1, "00:00:00:00:00:00", H2)),
    eth(A, B, 0x0806, arp(2, B, H2, A, H1)),
    eth(B, A, 0x0800, ipv4(H1, H2, 17, udp(50000, 53, dnsQ)), [[0x8100, 100]]),
    eth(A, B, 0x0800, ipv4(H2, H1, 17, udp(53, 50000, dnsQ)), [[0x8100, 100]]),
    eth(B, A, 0x0800, ipv4(H1, H2, 6, tcp(51000, 443, 1000, 0, 0x02))),
    eth(A, B, 0x0800, ipv4(H2, H1, 6, tcp(443, 51000, 5000, 1001, 0x12))),
    eth(B, A, 0x0800, ipv4(H1, H2, 6, tcp(51000, 443, 1001, 5001, 0x10))),
    eth(B, A, 0x0800, ipv4(H1, H2, 6, tcp(51000, 443, 1001, 5001, 0x18, Buffer.from("GET / HTTP/1.1\r\nHost: example.com\r\n\r\n")))),
    eth(B, A, 0x0800, ipv4(H1, H2, 1, Buffer.concat([b(8, 0), u16(0), u16(1), u16(1), Buffer.from("ping")]), { ttl: 3 })),
    eth(B, A, 0x86dd, ipv6(S6, D6, 0, Buffer.concat([b(17, 0, 1, 4, 0, 0, 0, 0), udp(5353, 5353, Buffer.from("mdns"))]))),
    eth(B, A, 0x86dd, ipv6(S6, D6, 6, tcp(40000, 80, 1, 0, 0x02))),
    eth(B, A, 0x0800, ipv4(H1, H2, 17, udp(1000, 2000, Buffer.from("qinq"))), [[0x88a8, 300], [0x8100, 200]]),
    eth(B, A, 0x0800, ipv4(H1, H2, 17, Buffer.from("rest of a fragment"), { frag: 0x2000 | 185, id: 77 })),
    eth(B, A, 0x0800, ipv4(H1, H2, 17, udp(7000, 7001, Buffer.alloc(400, 0x61)))),
];

// Classic pcap, little-endian, microseconds, snaplen 128: the last frame is cut short by it.
const SNAP = 128;
function classic() {
    const parts = [];
    const h = Buffer.alloc(24);
    h.writeUInt32LE(0xa1b2c3d4, 0); h.writeUInt16LE(2, 4); h.writeUInt16LE(4, 6); h.writeUInt32LE(SNAP, 16); h.writeUInt32LE(1, 20);
    parts.push(h);
    frames.forEach((f, i) => {
        const r = Buffer.alloc(16), kept = f.subarray(0, SNAP);
        r.writeUInt32LE(1793318400 + i, 0); r.writeUInt32LE(250000, 4); r.writeUInt32LE(kept.length, 8); r.writeUInt32LE(f.length, 12);
        parts.push(r, kept);
    });
    return Buffer.concat(parts);
}

// pcapng: a little-endian section with two interfaces (Ethernet at nanoseconds, raw IP at
// microseconds), then a big-endian section, as a file joined from two machines would be.
function ng(be) {
    const w32 = (v) => { const a = Buffer.alloc(4); be ? a.writeUInt32BE(v >>> 0) : a.writeUInt32LE(v >>> 0); return a; };
    const w16 = (v) => { const a = Buffer.alloc(2); be ? a.writeUInt16BE(v) : a.writeUInt16LE(v); return a; };
    const pad = (x) => Buffer.concat([x, Buffer.alloc((4 - x.length % 4) % 4)]);
    const opt = (c, v) => Buffer.concat([w16(c), w16(v.length), pad(v)]);
    const end = () => Buffer.concat([w16(0), w16(0)]);
    const block = (type, body) => { const len = 12 + body.length; return Buffer.concat([w32(type), w32(len), body, w32(len)]); };
    const shb = () => block(0x0a0d0d0a, Buffer.concat([w32(0x1a2b3c4d), w16(1), w16(0), Buffer.alloc(8, 0xff), opt(4, Buffer.from("sample maker")), end()]));
    const idb = (link, snap, res, name) => block(1, Buffer.concat([w16(link), w16(0), w32(snap), opt(2, Buffer.from(name)), opt(9, b(res)), end()]));
    const epb = (iface, ticks, data, orig = data.length) => block(6, Buffer.concat([w32(iface), w32(Number(ticks >> 32n)), w32(Number(ticks & 0xffffffffn)), w32(data.length), w32(orig), pad(data)]));
    const spb = (data) => block(3, Buffer.concat([w32(data.length), pad(data)]));
    return { shb, idb, epb, spb, block, w16, opt, end, pad };
}
function pcapng() {
    const le = ng(false), be = ng(true), T = 1793318400n;
    const nrb = le.block(4, Buffer.concat([le.w16(1), le.w16(17), ip(H2), Buffer.from("host.example\0"), Buffer.alloc(3), le.w16(0), le.w16(0)]));
    return Buffer.concat([
        le.shb(), le.idb(1, 65535, 9, "eth0"), le.idb(101, 65535, 6, "tun0"), nrb,
        le.epb(0, T * 1000000000n, frames[4]),
        le.epb(0, (T + 1n) * 1000000000n, frames[5]),
        le.epb(1, (T + 2n) * 1000000n, ipv4(H1, H2, 6, tcp(52000, 22, 1, 0, 0x02))),
        le.block(0x7fffffff, Buffer.alloc(8)), // a block a reader must skip
        le.spb(frames[0]),
        be.shb(), be.idb(1, 65535, 6, "en1"),
        be.epb(0, (T + 3n) * 1000000n, frames[2]),
    ]);
}
writeFileSync(join(here, "pcap_sample.pcap"), classic());
writeFileSync(join(here, "pcap_sample.pcapng"), pcapng());
console.log(`wrote ${frames.length} packets`);
