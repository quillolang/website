// A router exporting flows, for netflow.qwe. Written from Cisco's NetFlow v5 export format and
// v9 (RFC 3954), and IPFIX (RFC 7011 and the IANA IPFIX registry). When the example says "go" on
// the control port, it sends, once, to the example's collector:
//
//   two v5 packets, with a sequence gap of 3 flows between them
//   a v9 data FlowSet before its template, then the template (the flows must come with it)
//   a v9 options template and data (a sampling rate), and more data under the template
//   IPFIX: a template with IPv6 addresses, an enterprise field and a variable-length one, then data
//   a packet with a nonsense version, counted as an error
import { createSocket } from "node:dgram";

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
const ip = (s) => Buffer.from(s.split(".").map(Number));
const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16BE(v); return b; };
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); return b; };
const u8 = (v) => Buffer.from([v]);
const NOW = 1793318400, UPTIME = 100000000;

function v5(seq, flows) {
    const h = Buffer.concat([u16(5), u16(flows.length), u32(UPTIME), u32(NOW), u32(500000000), u32(seq), u8(0), u8(0), u16(0x4064)]);
    return Buffer.concat([h, ...flows.map((f) => Buffer.concat([ip(f.src), ip(f.dst), ip("10.0.0.254"), u16(2), u16(3), u32(f.pkts), u32(f.bytes), u32(UPTIME - 5000), u32(UPTIME - 1000), u16(f.sp), u16(f.dp), u8(0), u8(f.flags), u8(f.proto), u8(0), u16(64512), u16(15169), u8(24), u8(16), u16(0)]))]);
}
const set = (id, body) => { const pad = (4 - (body.length + 4) % 4) % 4; return Buffer.concat([u16(id), u16(body.length + 4 + pad), body, Buffer.alloc(pad)]); };
const v9 = (seq, sets) => Buffer.concat([u16(9), u16(sets.length), u32(UPTIME), u32(NOW), u32(seq), u32(77), ...sets]);
const ipfix = (seq, sets) => { const body = Buffer.concat(sets); return Buffer.concat([u16(10), u16(body.length + 16), u32(NOW), u32(seq), u32(5), body]); };

const TEMPLATE = [[8, 4], [12, 4], [7, 2], [11, 2], [4, 1], [1, 4], [2, 4], [6, 1]];
const template = (id, fields) => set(0, Buffer.concat([u16(id), u16(fields.length), ...fields.map(([t, l]) => Buffer.concat([u16(t), u16(l)]))]));
const record = (src, dst, sp, dp, proto, bytes, pkts, flags) => Buffer.concat([ip(src), ip(dst), u16(sp), u16(dp), u8(proto), u32(bytes), u32(pkts), u8(flags)]);

export async function start({ ports }) {
    const seen = { go: 0, sent: 0 };
    const control = createSocket("udp4"), out = createSocket("udp4");
    const collector = ports[1];
    const packets = () => [
        v5(1000, [{ src: "192.0.2.10", dst: "198.51.100.20", sp: 51000, dp: 443, proto: 6, flags: 0x1b, pkts: 12, bytes: 3400 }, { src: "192.0.2.11", dst: "198.51.100.20", sp: 53000, dp: 53, proto: 17, flags: 0, pkts: 1, bytes: 80 }]),
        v5(1005, [{ src: "192.0.2.10", dst: "198.51.100.21", sp: 51001, dp: 80, proto: 6, flags: 0x02, pkts: 3, bytes: 180 }]),
        v9(1, [set(300, record("10.1.1.1", "10.2.2.2", 40000, 22, 6, 9000, 40, 0x18))]),
        v9(2, [template(300, TEMPLATE)]),
        v9(3, [set(1, Buffer.concat([u16(301), u16(4), u16(8), u16(1), u16(4), u16(34), u16(4), u16(35), u16(1)])), set(301, Buffer.concat([u32(10), u32(100), u8(2)]))]),
        v9(4, [set(300, Buffer.concat([record("10.1.1.2", "10.2.2.3", 40001, 443, 6, 1200, 8, 0x10), record("10.1.1.3", "10.2.2.4", 40002, 123, 17, 76, 1, 0)]))]),
        ipfix(0, [set(2, Buffer.concat([u16(400), u16(5), u16(27), u16(16), u16(28), u16(16), u16(152), u16(8), u16(153), u16(8), u16(1), u16(8)])),
                  set(2, Buffer.concat([u16(401), u16(3), u16(1), u16(8), u16(0x8000 | 12345), u16(4), u32(9), u16(351), u16(65535)]))]),
        ipfix(0, [set(400, Buffer.concat([Buffer.from("20010db8000000000000000000000001", "hex"), Buffer.from("20010db8000000000000000000000002", "hex"), Buffer.from(u64(1793318400000n)), Buffer.from(u64(1793318402500n)), Buffer.from(u64(555n))]))]),
        ipfix(1, [set(401, Buffer.concat([Buffer.from(u64(10n)), u32(0xdeadbeef), u8(5), Buffer.from("hello")]))]),
        Buffer.from([0, 7, 0, 0]),
    ];
    function u64(v) { const b = Buffer.alloc(8); b.writeBigUInt64BE(v); return b; }
    control.on("message", () => {
        if (seen.go++) return;
        let i = 0;
        const list = packets();
        const next = () => {
            if (i >= list.length) return;
            seen.sent++;
            out.send(list[i++], collector, "127.0.0.1", () => setTimeout(next, 5));
        };
        next();
    });
    await bindUdp(control, ports[0]);
    await bindUdp(out, ports[2]);
    return {
        env: { NETFLOW_PORT: String(collector), NETFLOW_EXPORTER: String(ports[0]) },
        close() { setTimeout(() => { control.close(); out.close(); }, 50); },
        check() { return seen.sent === 0 ? "the example never asked for flows" : null; },
    };
}
