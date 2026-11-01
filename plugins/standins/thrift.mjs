// A Thrift server on the framed transport for thrift.qwe. Written from Apache Thrift's
// doc/specs/thrift-binary-protocol.md, thrift-compact-protocol.md and thrift-rpc.md: its decoder
// and encoder below are its own, so a value that comes back whole has been through a second
// implementation of both protocols. It answers each call in the protocol the call came in.
//
//   add(1:i32, 2:i32) -> i32          ping() -> void            note(1:string) oneway
//   echo(1:struct) -> struct          divide(1:i32, 2:i32) throws (1:DivideByZero)
// Others get TApplicationException UNKNOWN_METHOD; crash gets INTERNAL_ERROR; wrongseq answers
// with another sequence id; hang never answers.
import { createServer } from "node:net";

const T = { BOOL: 2, BYTE: 3, DOUBLE: 4, I16: 6, I32: 8, I64: 10, STRING: 11, STRUCT: 12, MAP: 13, SET: 14, LIST: 15, UUID: 16 };
const toC = { [T.BOOL]: 1, [T.BYTE]: 3, [T.I16]: 4, [T.I32]: 5, [T.I64]: 6, [T.DOUBLE]: 7, [T.STRING]: 8, [T.LIST]: 9, [T.SET]: 10, [T.MAP]: 11, [T.STRUCT]: 12, [T.UUID]: 13 };
const fromC = { 1: T.BOOL, 2: T.BOOL, 3: T.BYTE, 4: T.I16, 5: T.I32, 6: T.I64, 7: T.DOUBLE, 8: T.STRING, 9: T.LIST, 10: T.SET, 11: T.MAP, 12: T.STRUCT, 13: T.UUID };

class R {
    constructor(b) { this.b = b; this.i = 0; }
    u8() { return this.b[this.i++]; }
    take(n) { const s = this.b.subarray(this.i, this.i + n); if (s.length < n) throw new Error("short read"); this.i += n; return s; }
    i16() { const v = this.b.readInt16BE(this.i); this.i += 2; return v; }
    i32() { const v = this.b.readInt32BE(this.i); this.i += 4; return v; }
    i64() { const v = this.b.readBigInt64BE(this.i); this.i += 8; return v; }
    varint() { let v = 0n, s = 0n; for (;;) { const x = BigInt(this.u8()); v |= (x & 127n) << s; if (!(x & 128n)) return v; s += 7n; } }
    zig() { const v = this.varint(); return (v >> 1n) ^ -(v & 1n); }
}
class W {
    constructor() { this.p = []; }
    u8(x) { this.p.push(Buffer.from([x & 255])); }
    raw(b) { this.p.push(b); }
    i16(x) { const b = Buffer.alloc(2); b.writeInt16BE(x); this.p.push(b); }
    i32(x) { const b = Buffer.alloc(4); b.writeInt32BE(x); this.p.push(b); }
    i64(x) { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(x)); this.p.push(b); }
    varint(v) { v = BigInt(v); while (v >= 128n) { this.u8(Number((v & 127n) | 128n)); v >>= 7n; } this.u8(Number(v)); }
    zig(x) { x = BigInt(x); this.varint(BigInt.asUintN(64, (x << 1n) ^ (x >> 63n))); }
    done() { return Buffer.concat(this.p); }
}

// A value on this side is { t, v }, with v shaped by t; a struct is a list of [id, value].
const bin = {
    read(r, t) {
        switch (t) {
            case T.BOOL: return r.u8() !== 0;
            case T.BYTE: return r.b.readInt8(r.i++);
            case T.DOUBLE: { const v = r.b.readDoubleBE(r.i); r.i += 8; return v; }
            case T.I16: return r.i16();
            case T.I32: return r.i32();
            case T.I64: return r.i64();
            case T.STRING: return Buffer.from(r.take(r.i32()));
            case T.UUID: return Buffer.from(r.take(16));
            case T.STRUCT: { const f = []; for (;;) { const ty = r.u8(); if (ty === 0) return f; const id = r.i16(); f.push([id, { t: ty, v: bin.read(r, ty) }]); } }
            case T.LIST: case T.SET: { const e = r.u8(), n = r.i32(), l = []; for (let i = 0; i < n; i++) l.push(bin.read(r, e)); return { e, l }; }
            case T.MAP: { const k = r.u8(), w = r.u8(), n = r.i32(), l = []; for (let i = 0; i < n; i++) l.push([bin.read(r, k), bin.read(r, w)]); return { k, w, l }; }
        }
        throw new Error(`type ${t}`);
    },
    write(o, t, v) {
        switch (t) {
            case T.BOOL: return o.u8(v ? 1 : 0);
            case T.BYTE: return o.u8(v);
            case T.DOUBLE: { const b = Buffer.alloc(8); b.writeDoubleBE(v); return o.raw(b); }
            case T.I16: return o.i16(v);
            case T.I32: return o.i32(v);
            case T.I64: return o.i64(v);
            case T.STRING: o.i32(v.length); return o.raw(v);
            case T.UUID: return o.raw(v);
            case T.STRUCT: for (const [id, f] of v) { o.u8(f.t); o.i16(id); bin.write(o, f.t, f.v); } return o.u8(0);
            case T.LIST: case T.SET: o.u8(v.e); o.i32(v.l.length); return v.l.forEach((x) => bin.write(o, v.e, x));
            case T.MAP: o.u8(v.k); o.u8(v.w); o.i32(v.l.length); return v.l.forEach(([a, b]) => { bin.write(o, v.k, a); bin.write(o, v.w, b); });
        }
    },
};
const cmp = {
    read(r, t) {
        switch (t) {
            case T.BOOL: return r.u8() === 1;
            case T.BYTE: return r.b.readInt8(r.i++);
            case T.DOUBLE: { const v = r.b.readDoubleLE(r.i); r.i += 8; return v; }
            case T.I16: case T.I32: return Number(r.zig());
            case T.I64: return r.zig();
            case T.STRING: return Buffer.from(r.take(Number(r.varint())));
            case T.UUID: return Buffer.from(r.take(16));
            case T.STRUCT: {
                const f = []; let last = 0;
                for (;;) {
                    const h = r.u8(); if (h === 0) return f;
                    const d = h >> 4, c = h & 15, id = d ? last + d : Number(r.zig()); last = id;
                    const ty = fromC[c];
                    f.push([id, { t: ty, v: ty === T.BOOL ? c === 1 : cmp.read(r, ty) }]);
                }
            }
            case T.LIST: case T.SET: { const h = r.u8(); let n = h >> 4; if (n === 15) n = Number(r.varint()); const e = fromC[h & 15], l = []; for (let i = 0; i < n; i++) l.push(cmp.read(r, e)); return { e, l }; }
            case T.MAP: { const n = Number(r.varint()); if (!n) return { k: T.STRING, w: T.STRING, l: [] }; const h = r.u8(), k = fromC[h >> 4], w = fromC[h & 15], l = []; for (let i = 0; i < n; i++) l.push([cmp.read(r, k), cmp.read(r, w)]); return { k, w, l }; }
        }
        throw new Error(`type ${t}`);
    },
    write(o, t, v) {
        switch (t) {
            case T.BOOL: return o.u8(v ? 1 : 2);
            case T.BYTE: return o.u8(v);
            case T.DOUBLE: { const b = Buffer.alloc(8); b.writeDoubleLE(v); return o.raw(b); }
            case T.I16: case T.I32: case T.I64: return o.zig(v);
            case T.STRING: o.varint(v.length); return o.raw(v);
            case T.UUID: return o.raw(v);
            case T.STRUCT: {
                let last = 0;
                for (const [id, f] of v) {
                    const c = f.t === T.BOOL ? (f.v ? 1 : 2) : toC[f.t], d = id - last;
                    if (d > 0 && d <= 15) o.u8((d << 4) | c); else { o.u8(c); o.zig(id); }
                    last = id;
                    if (f.t !== T.BOOL) cmp.write(o, f.t, f.v);
                }
                return o.u8(0);
            }
            case T.LIST: case T.SET: if (v.l.length < 15) o.u8((v.l.length << 4) | toC[v.e]); else { o.u8(0xf0 | toC[v.e]); o.varint(v.l.length); } return v.l.forEach((x) => cmp.write(o, v.e, x));
            case T.MAP: o.varint(v.l.length); if (v.l.length) o.u8((toC[v.k] << 4) | toC[v.w]); return v.l.forEach(([a, b]) => { cmp.write(o, v.k, a); cmp.write(o, v.w, b); });
        }
    },
};
function parseMessage(b) {
    const r = new R(b);
    if (b[0] === 0x82) {
        r.u8(); const h = r.u8(), kind = h >> 5, seq = Number(r.varint()), name = r.take(Number(r.varint())).toString();
        return { compact: true, kind, seq, name, body: cmp.read(r, T.STRUCT) };
    }
    const v = r.i32() >>> 0;
    if ((v & 0xffff0000) >>> 0 !== 0x80010000) throw new Error("bad version");
    const name = r.take(r.i32()).toString(), seq = r.i32();
    return { compact: false, kind: v & 255, seq, name, body: bin.read(r, T.STRUCT) };
}
function message(compact, name, kind, seq, fields) {
    const o = new W();
    const n = Buffer.from(name);
    if (compact) { o.u8(0x82); o.u8((kind << 5) | 1); o.varint(seq); o.varint(n.length); o.raw(n); cmp.write(o, T.STRUCT, fields); }
    else { o.i32((0x80010000 | kind) | 0); o.i32(n.length); o.raw(n); o.i32(seq); bin.write(o, T.STRUCT, fields); }
    const m = o.done(), h = Buffer.alloc(4); h.writeUInt32BE(m.length);
    return Buffer.concat([h, m]);
}
const appError = (compact, name, seq, text, type) => message(compact, name, 3, seq, [[1, { t: T.STRING, v: Buffer.from(text) }], [2, { t: T.I32, v: type }]]);

export async function start({ port }) {
    const seen = { calls: {}, compact: 0, oneway: 0, problems: [] };
    const server = createServer((s) => {
        s.on("error", () => {});
        let buf = Buffer.alloc(0);
        s.on("data", (d) => {
            buf = Buffer.concat([buf, d]);
            while (buf.length >= 4) {
                const n = buf.readUInt32BE(0);
                if (n > 1 << 24) { seen.problems.push("a frame length that is not one: an unframed client?"); s.destroy(); return; }
                if (buf.length < 4 + n) return;
                const frame = buf.subarray(4, 4 + n);
                buf = buf.subarray(4 + n);
                let m;
                try { m = parseMessage(frame); } catch (e) { seen.problems.push(`a bad message: ${e.message}`); s.destroy(); return; }
                seen.calls[m.name] = (seen.calls[m.name] ?? 0) + 1;
                if (m.compact) seen.compact++;
                if (m.name === "note") { if (m.kind !== 4) seen.problems.push("note was not oneway"); seen.oneway++; continue; }
                if (m.kind !== 1) seen.problems.push(`${m.name}: message type ${m.kind}`);
                const arg = (id) => m.body.find((f) => f[0] === id)?.[1];
                const reply = (fields) => s.write(message(m.compact, m.name, 2, m.seq, fields));
                if (m.name === "ping") reply([]);
                else if (m.name === "add") reply([[0, { t: T.I32, v: arg(1).v + arg(2).v }]]);
                else if (m.name === "echo") reply([[0, arg(1)]]);
                else if (m.name === "divide") {
                    if (arg(2).v === 0) reply([[1, { t: T.STRUCT, v: [[1, { t: T.STRING, v: Buffer.from("cannot divide by zero") }], [2, { t: T.I32, v: 400 }]] }]]);
                    else reply([[0, { t: T.I32, v: Math.trunc(arg(1).v / arg(2).v) }]]);
                }
                else if (m.name === "crash") s.write(appError(m.compact, m.name, m.seq, "the handler blew up", 6));
                else if (m.name === "wrongseq") s.write(message(m.compact, m.name, 2, m.seq + 1000, []));
                else if (m.name === "hang") { /* no answer */ }
                else s.write(appError(m.compact, m.name, m.seq, `Unknown function ${m.name}`, 1));
            }
        });
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { THRIFT_HOST: `127.0.0.1:${port}` },
        close() { server.close(); },
        check() {
            if (seen.problems.length) return seen.problems[0];
            if (!seen.calls.add || seen.compact === 0) return "no call came in the compact protocol";
            if (seen.oneway === 0) return "the oneway call never came";
            return null;
        },
    };
}
