// A ControlLogix-like controller for ethernet_ip.qwe, written from the CIP specification (vol. 1)
// and EtherNet/IP (vol. 2) and Rockwell's "Logix 5000 Data Access" manual: the 24-byte encapsulation
// header, RegisterSession, SendRRData with its CPF items, Unconnected Send (0x52) to the Connection
// Manager with a route to the slot, Forward Open (0x54), SendUnitData with a sequence number, Read
// Tag (0x4C), Write Tag (0x4D), Read Tag Fragmented (0x52) and Multiple Service Packet (0x0A).
//
// A read of more than 480 bytes answers status 0x06 and goes on in fragments. A session handle
// must be the one given out. Only slot 0 holds a controller.
import { createServer } from "node:net";

const T = { BOOL: 0xc1, DINT: 0xc4, REAL: 0xca, INT: 0xc3 };
const SIZE = { 0xc1: 1, 0xc3: 2, 0xc4: 4, 0xca: 4 };
function tags() {
    const m = new Map();
    const scalar = (name, type, values, dims) => m.set(name, { type, values: Array.isArray(values) ? values : [values], dims });
    scalar("Motor_Speed", T.REAL, 1200.25);
    scalar("Line_Count", T.DINT, 90210);
    scalar("Running", T.BOOL, 0);
    scalar("Safety_Stop", T.BOOL, 0);
    scalar("Recipe", T.DINT, Array.from({ length: 300 }, (_, i) => i * 3));
    scalar("Program:Main.Valve", T.INT, [0, 1, 2, 303]);
    scalar("Oven.Zones.Temp", T.REAL, Array.from({ length: 12 }, (_, i) => 100 + i), [3, 4]);
    m.set("Batch", { string: "B-2026-10" });
    return m;
}
const le = {
    enc(type, v) {
        const b = Buffer.alloc(SIZE[type]);
        if (type === T.REAL) b.writeFloatLE(v); else if (type === T.DINT) b.writeInt32LE(v); else if (type === T.INT) b.writeInt16LE(v); else b[0] = v;
        return b;
    },
    dec(type, b) { return type === T.REAL ? b.readFloatLE(0) : type === T.DINT ? b.readInt32LE(0) : type === T.INT ? b.readInt16LE(0) : b[0]; },
};
const reply = (svc, status, data = Buffer.alloc(0), ext = []) => {
    const h = Buffer.alloc(4 + ext.length * 2); h[0] = svc | 0x80; h[2] = status; h[3] = ext.length;
    ext.forEach((e, i) => h.writeUInt16LE(e, 4 + i * 2));
    return Buffer.concat([h, data]);
};
function parsePath(p) {
    let i = 0, name = []; const index = [];
    while (i < p.length) {
        if (p[i] === 0x91) { const n = p[i + 1]; name.push(p.subarray(i + 2, i + 2 + n).toString()); i += 2 + n + (n % 2); }
        else if (p[i] === 0x28) { index.push(p[i + 1]); i += 2; }
        else if (p[i] === 0x29) { index.push(p.readUInt16LE(i + 2)); i += 4; }
        else if (p[i] === 0x2a) { index.push(p.readUInt32LE(i + 2)); i += 6; }
        else return null;
    }
    return { name: name.join("."), index };
}

export async function start({ port }) {
    const seen = { sessions: 0, fragments: 0, forwardOpens: 0, closes: 0, connected: 0, routed: 0, writes: 0, problems: [], unregister: 0 };
    const store = tags();
    let handles = 1000;
    const elementAt = (t, index) => {
        if (!index.length) return 0;
        if (t.dims && index.length === 2) return index[0] * t.dims[1] + index[1];
        return index[0];
    };
    function service(req) {
        const svc = req[0], words = req[1], path = req.subarray(2, 2 + words * 2), data = req.subarray(2 + words * 2);
        if (svc === 0x0a) {
            const n = data.readUInt16LE(0), out = [];
            for (let i = 0; i < n; i++) {
                const s = data.readUInt16LE(2 + i * 2), e = i + 1 < n ? data.readUInt16LE(4 + i * 2) : data.length;
                out.push(service(data.subarray(s, e)));
            }
            const head = Buffer.alloc(2 + n * 2); head.writeUInt16LE(n, 0);
            let at = head.length;
            out.forEach((r, i) => { head.writeUInt16LE(at, 2 + i * 2); at += r.length; });
            return reply(0x0a, out.some((r) => r[2] !== 0) ? 0x1e : 0, Buffer.concat([head, ...out]));
        }
        const parsed = parsePath(path);
        if (!parsed) return reply(svc, 0x04, undefined, [0]);
        const t = store.get(parsed.name);
        if (!t) return reply(svc, 0x04, undefined, [0]);
        if (t.string !== undefined) {
            if (svc === 0x4c) {
                const b = Buffer.alloc(92); b.writeUInt16LE(0x02a0, 0); b.writeUInt16LE(0x0fce, 2); b.writeInt32LE(t.string.length, 4); b.write(t.string, 8, "latin1");
                return reply(svc, 0, b);
            }
            if (svc === 0x4d) {
                if (data.readUInt16LE(0) !== 0x02a0 || data.readUInt16LE(2) !== 0x0fce || data.readUInt16LE(4) !== 1 || data.length !== 6 + 88) return reply(svc, 0xff, undefined, [0x2107]);
                const n = data.readInt32LE(6);
                t.string = data.subarray(10, 10 + n).toString("latin1");
                seen.writes++;
                return reply(svc, 0);
            }
        }
        const size = SIZE[t.type], at = elementAt(t, parsed.index);
        if (svc === 0x4c || svc === 0x52) {
            const count = data.readUInt16LE(0);
            if (at + count > t.values.length) return reply(svc, 0xff, undefined, [0x2105]);
            const all = Buffer.concat(t.values.slice(at, at + count).map((v) => le.enc(t.type, v)));
            const offset = svc === 0x52 ? data.readUInt32LE(2) : 0;
            if (svc === 0x52) seen.fragments++;
            const part = all.subarray(offset, offset + 480);
            const type = Buffer.alloc(2); type.writeUInt16LE(t.type);
            return reply(svc, offset + part.length < all.length ? 0x06 : 0, Buffer.concat([type, part]));
        }
        if (svc === 0x4d) {
            const type = data.readUInt16LE(0), count = data.readUInt16LE(2);
            if (type !== t.type) return reply(svc, 0xff, undefined, [0x2107]);
            if (parsed.name === "Safety_Stop") return reply(svc, 0x0f);
            if (data.length !== 4 + count * size) return reply(svc, 0x13);
            if (at + count > t.values.length) return reply(svc, 0xff, undefined, [0x2105]);
            for (let i = 0; i < count; i++) t.values[at + i] = type === T.BOOL ? (data[4 + i] ? 1 : 0) : le.dec(type, data.subarray(4 + i * size));
            seen.writes++;
            return reply(svc, 0);
        }
        return reply(svc, 0x08);
    }
    const connections = new Map();
    const server = createServer((s) => {
        s.on("error", () => {});
        let buf = Buffer.alloc(0), session = 0;
        const send = (cmd, body, status = 0, ctx = Buffer.alloc(8)) => {
            const h = Buffer.alloc(24); h.writeUInt16LE(cmd, 0); h.writeUInt16LE(body.length, 2); h.writeUInt32LE(session, 4); h.writeUInt32LE(status, 8); ctx.copy(h, 12);
            s.write(Buffer.concat([h, body]));
        };
        s.on("data", (d) => {
            buf = Buffer.concat([buf, d]);
            while (buf.length >= 24) {
                const len = buf.readUInt16LE(2);
                if (buf.length < 24 + len) return;
                const cmd = buf.readUInt16LE(0), sess = buf.readUInt32LE(4), ctx = Buffer.from(buf.subarray(12, 20)), body = buf.subarray(24, 24 + len);
                buf = buf.subarray(24 + len);
                if (cmd === 0x0063) {
                    const name = "1756-L83E/B"; const it = Buffer.alloc(33 + 1 + name.length + 1);
                    it.writeUInt16LE(1, 0); it.writeUInt16BE(2, 2); it.writeUInt16BE(44818, 4); [10, 0, 0, 10].forEach((x, i) => { it[6 + i] = x; });
                    // The sockaddr ends at byte 18 of the item's data.
                    it.writeUInt16LE(1, 18); it.writeUInt16LE(14, 20); it.writeUInt16LE(166, 22); it[24] = 33; it[25] = 11; it.writeUInt16LE(0x3060, 26); it.writeUInt32LE(0xc0ffee42, 28); it[32] = name.length; it.write(name, 33, "latin1"); it[33 + name.length] = 3;
                    const head = Buffer.alloc(6); head.writeUInt16LE(1, 0); head.writeUInt16LE(0x0c, 2); head.writeUInt16LE(it.length, 4);
                    send(0x0063, Buffer.concat([head, it]), 0, ctx);
                } else if (cmd === 0x0065) {
                    if (body.readUInt16LE(0) !== 1) { send(cmd, body, 0x69, ctx); continue; }
                    session = ++handles; seen.sessions++;
                    send(cmd, body, 0, ctx);
                } else if (cmd === 0x0066) {
                    seen.unregister++;
                } else if (cmd === 0x006f || cmd === 0x0070) {
                    if (sess !== session) { send(cmd, Buffer.alloc(0), 0x64, ctx); continue; }
                    const n = body.readUInt16LE(6); let i = 8; const items = [];
                    for (let k = 0; k < n; k++) { const ty = body.readUInt16LE(i), l = body.readUInt16LE(i + 2); items.push({ ty, data: body.subarray(i + 4, i + 4 + l) }); i += 4 + l; }
                    if (cmd === 0x0070) {
                        const id = items[0].data.readUInt32LE(0), c = connections.get(id);
                        if (items[0].ty !== 0xa1 || items[1].ty !== 0xb1 || !c) { send(cmd, Buffer.alloc(0), 0x03, ctx); continue; }
                        seen.connected++;
                        const seq = items[1].data.subarray(0, 2);
                        const req = items[1].data.subarray(2);
                        const r = req[0] === 0x4e ? (connections.delete(id), seen.closes++, reply(0x4e, 0, Buffer.alloc(10))) : service(req);
                        const out = Buffer.concat([seq, r]);
                        const hdr = Buffer.alloc(8 + 8 + 4); hdr.writeUInt16LE(2, 6); hdr.writeUInt16LE(0xa1, 8); hdr.writeUInt16LE(4, 10); hdr.writeUInt32LE(c.to, 12); hdr.writeUInt16LE(0xb1, 16); hdr.writeUInt16LE(out.length, 18);
                        send(cmd, Buffer.concat([hdr, out]), 0, ctx);
                        continue;
                    }
                    if (items[0].ty !== 0 || items[1].ty !== 0xb2) { send(cmd, Buffer.alloc(0), 0x03, ctx); continue; }
                    let req = items[1].data, r;
                    const cm = req[1] === 2 && req[2] === 0x20 && req[3] === 0x06;
                    if (req[0] === 0x52 && cm) {
                        const size = req.readUInt16LE(8), inner = req.subarray(10, 10 + size);
                        const after = 10 + size + (size % 2), words = req[after], route = req.subarray(after + 2, after + 2 + words * 2);
                        seen.routed++;
                        r = route[0] === 1 && route[1] === 0 ? service(inner) : reply(0x52, 0x01, undefined, [0x0312]);
                    } else if (req[0] === 0x54 && cm) {
                        const f = req.subarray(6);
                        const words = f[35], path = f.subarray(36, 36 + words * 2);
                        if (path[0] !== 1 || path[1] !== 0) r = reply(0x54, 0x01, undefined, [0x0312]);
                        else {
                            seen.forwardOpens++;
                            const id = 0x7f000000 + seen.forwardOpens, to = f.readUInt32LE(6);
                            connections.set(id, { to });
                            const o = Buffer.alloc(26); o.writeUInt32LE(id, 0); o.writeUInt32LE(to, 4);
                            r = reply(0x54, 0, o);
                        }
                    } else if (req[0] === 0x4e && cm) {
                        seen.closes++;
                        r = reply(0x4e, 0, Buffer.alloc(10));
                    } else r = service(req);
                    const hdr = Buffer.alloc(8 + 4 + 4); hdr.writeUInt16LE(2, 6); hdr.writeUInt16LE(0xb2, 12); hdr.writeUInt16LE(r.length, 14);
                    send(cmd, Buffer.concat([hdr, r]), 0, ctx);
                } else send(cmd, Buffer.alloc(0), 0x01, ctx);
            }
        });
    });
    await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
    return {
        env: { EIP_HOST: `127.0.0.1:${port}`, EIP_SLOT: "0" },
        close() { server.close(); },
        check() {
            if (seen.problems.length) return seen.problems[0];
            if (seen.fragments === 0) return "the long read never used Read Tag Fragmented";
            if (seen.forwardOpens === 0 || seen.closes === 0) return "no Forward Open and Forward Close";
            if (seen.connected === 0) return "nothing went over SendUnitData";
            if (seen.routed === 0) return "nothing went through Unconnected Send";
            return null;
        },
    };
}
