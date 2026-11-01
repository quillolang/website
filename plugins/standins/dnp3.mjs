// A DNP3 outstation over TCP for the dnp3 plugin's test, written from IEEE 1815's public descriptions
// (the standard is not free; the DNP3 primer and opendnp3's documents give the same frames): link
// frames with a CRC-16/DNP over the header and each 16-byte block, checked on what arrives; REQUEST
// LINK STATUS; transport segments in, and out in frames of 249 bytes; application READ of class 0
// to 3 and of groups 1, 10, 30 and 40, a read of 1,000 analogs in several fragments, each with CON
// and waiting for the master's CONFIRM before the next; events cleared only by that confirmation; group
// 80 write to clear restart; group 12 and 41 controls with SELECT, then OPERATE with the same bytes
// or NO_SELECT, DIRECT_OPERATE, control status answers; time write; ENABLE and DISABLE_UNSOLICITED,
// an unsolicited response with CON; IIN bits. One bad frame is sent before the big answer: a CRC
// error the master must drop.
//
//   start({ port }) -> { env: { DNP3_HOST }, close(), check() }
import { createServer } from "node:net";

const ADDR = 10;
function crc(b) { let c = 0; for (const x of b) { c ^= x; for (let i = 0; i < 8; i++) c = c & 1 ? (c >>> 1) ^ 0xa6bc : c >>> 1; } c = ~c & 0xffff; return Buffer.from([c & 255, c >> 8]); }
if (crc(Buffer.from("123456789")).toString("hex") !== "82ea") throw new Error("CRC-16/DNP check value");
function frame(ctrl, dst, src, user) {
    const h = Buffer.from([5, 0x64, user.length + 5, ctrl, dst & 255, dst >> 8, src & 255, src >> 8]);
    const parts = [h, crc(h)];
    for (let i = 0; i < user.length; i += 16) { const b = user.subarray(i, i + 16); parts.push(b, crc(b)); }
    return Buffer.concat(parts);
}
const f32 = (v) => { const b = Buffer.alloc(4); b.writeFloatLE(v); return b; };
const i16 = (v) => { const b = Buffer.alloc(2); b.writeInt16LE(v); return b; };
const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const i32 = (v) => { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; };
const time48 = (ms) => { const b = Buffer.alloc(6); b.writeUIntLE(ms, 0, 6); return b; };

export async function start({ port }) {
    const stats = { polls: 0, confirms: 0, selects: 0, operates: 0, unsolicited: 0, bigFragments: 0, crcBad: 0, linkStatus: 0, cleared: 0 };
    const server = createServer((s) => {
        s.on("error", () => {});
        let buf = Buffer.alloc(0), gather = Buffer.alloc(0), trSeq = 0, master = 1, uSeq = 0, restart = true, needTime = true;
        let events = [["binary", 3, true, 1730000000123], ["analog", 1, 13.5, 1730000000456]];
        let outputs = new Map([[0, false], [1, false]]), aout = new Map([[0, 0], [1, 0]]);
        let selected = null, waiting = null, unsolTimer = null, uAwait = null;
        const app = (bytes) => {
            let at = 0, first = true;
            do {
                const piece = bytes.subarray(at, at + 249);
                at += piece.length;
                const t = Buffer.from([(first ? 0x40 : 0) | (at >= bytes.length ? 0x80 : 0) | trSeq]);
                trSeq = (trSeq + 1) & 63;
                first = false;
                s.write(frame(0x44, master, ADDR, Buffer.concat([t, piece])));
            } while (at < bytes.length);
        };
        const iin = () => {
            let a = 0, b = 0;
            if (events.length) a |= 2;
            if (needTime) a |= 0x10;
            if (restart) a |= 0x80;
            return [a, b];
        };
        const respond = (seq, body, opts = {}) => {
            const [a, b] = iin();
            const ac = 0xc0 | (opts.con ? 0x20 : 0) | (seq & 15);
            if (opts.acFlags != null) return app(Buffer.concat([Buffer.from([opts.acFlags | (seq & 15), 129, a | (opts.iin1 ?? 0), b | (opts.iin2 ?? 0)]), body]));
            app(Buffer.concat([Buffer.from([ac, 129, a | (opts.iin1 ?? 0), b | (opts.iin2 ?? 0)]), body]));
        };
        const staticData = () => Buffer.concat([
            Buffer.from([1, 2, 0, 0, 3, 0x81, 0x05, 0x01, 0x01]), // g1v2 start 0 stop 3
            Buffer.from([10, 2, 0, 0, 1, outputs.get(0) ? 0x81 : 0x01, outputs.get(1) ? 0x81 : 0x01]),
            Buffer.from([20, 1, 0, 0, 0, 1]), i32(123456),
            Buffer.from([30, 5, 0, 0, 0, 1]), f32(230.25),
            Buffer.from([30, 2, 0, 1, 1, 1]), i16(-42),
        ]);
        const eventData = () => Buffer.concat(events.map(([k, i, v, t]) => k === "binary"
            ? Buffer.concat([Buffer.from([2, 2, 0x17, 1, i, (v ? 0x80 : 0) | 1]), time48(t)])
            : Buffer.concat([Buffer.from([32, 7, 0x17, 1, i, 1]), f32(v), time48(t)])));
        function objectsAt(b) {
            const out = [];
            let a = 0;
            while (a < b.length) {
                const [g, v, q] = [b[a], b[a + 1], b[a + 2]]; a += 3;
                const h = { g, v, q };
                if (q === 0x06) { out.push(h); continue; }
                if (q === 0x00) { h.start = b[a]; h.stop = b[a + 1]; a += 2; }
                else if (q === 0x01) { h.start = b.readUInt16LE(a); h.stop = b.readUInt16LE(a + 2); a += 4; }
                else if (q === 0x07) { h.count = b[a]; a += 1; h.data = b.subarray(a); a = b.length; }
                else if (q === 0x28) { h.count = b.readUInt16LE(a); a += 2; h.data = b.subarray(a); a = b.length; }
                else { h.bad = true; a = b.length; }
                out.push(h);
            }
            return out;
        }
        function read(seq, list) {
            stats.polls++;
            const parts = [];
            let con = false, unknown = false;
            for (const h of list) {
                if (h.g === 60) {
                    if (h.v === 1) parts.push(staticData());
                    else if (events.length && h.v === 2) { parts.push(eventData()); con = true; }
                    continue;
                }
                if (h.g === 1 && h.v === 1) {
                    if ((h.start ?? 0) > 3) { unknown = true; continue; }
                    parts.push(Buffer.from([1, 1, 0, 0, 2, 0b101]));
                    continue;
                }
                if (h.g === 1) { parts.push(Buffer.from([1, 2, 0, h.start, h.stop, ...[0x81, 0x05, 0x01, 0x81].slice(h.start, h.stop + 1)])); continue; }
                if (h.g === 10) { parts.push(Buffer.from([10, 2, 0, h.start, h.stop, outputs.get(h.start) ? 0x81 : 0x01])); continue; }
                if (h.g === 30 && h.v === 5) { parts.push(Buffer.from([30, 5, 0, 0, 0, 1]), f32(230.25)); continue; }
                if (h.g === 30 && h.v === 2) return bigRead(seq, h);
                if (h.g === 40 && h.v === 3) { parts.push(Buffer.from([40, 3, 0, h.start, h.stop, 1]), f32(aout.get(h.start))); continue; }
                unknown = true;
            }
            respond(seq, Buffer.concat(parts), { con, iin2: unknown ? 2 : 0 });
            if (con) waiting = { seq, then: () => { events = []; } };
        }
        function bigRead(seq, h) {
            const per = 200, count = h.stop - h.start + 1;
            let at = h.start, n = seq;
            s.write(Buffer.concat([frame(0x44, master, ADDR, Buffer.from([0xc0, 0xc0, 129, 0, 0])).subarray(0, 8), Buffer.from([0, 0])])); stats.crcBad++;
            const next = () => {
                const stop = Math.min(at + per - 1, h.stop), body = [Buffer.from([30, 2, 1]), u16(at), u16(stop)];
                for (let i = at; i <= stop; i++) body.push(Buffer.from([1]), i16(i * 2));
                const fir = at === h.start, fin = stop === h.stop;
                stats.bigFragments++;
                respond(n, Buffer.concat(body), { acFlags: (fir ? 0x80 : 0) | (fin ? 0x40 : 0) | 0x20 });
                at = stop + 1;
                waiting = { seq: n, then: fin ? null : next };
                n = (n + 1) & 15;
            };
            next();
        }
        const key = (b) => b.toString("hex");
        function controls(seq, fc, list, raw) {
            const h = list[0];
            const size = h.g === 12 ? 11 : h.v === 1 ? 5 : h.v === 3 ? 5 : 0;
            if (!h.data || h.q !== 0x28) return respond(seq, Buffer.alloc(0), { iin2: 4 });
            const idx = h.data.readUInt16LE(0), obj = Buffer.from(h.data.subarray(2, 2 + size));
            const echo = (status) => { const o = Buffer.from(obj); o[size - 1] = status; respond(seq, Buffer.concat([raw.subarray(0, 5), u16(idx), o])); };
            const max = h.g === 12 ? 2 : 1;
            if (idx > max) return echo(4);
            if (h.g === 12 && idx === 2) return echo(7);
            if (fc === 3) { stats.selects++; selected = key(raw); return echo(0); }
            if (fc === 4) {
                if (selected !== key(raw)) return echo(2);
                selected = null;
            }
            stats.operates++;
            if (h.g === 12) { const c = obj[0]; if (c === 3 || c === 4) { outputs.set(idx, c === 3); events.push(["binary", idx, c === 3, 1730000100000 + events.length]); } }
            else aout.set(idx, h.v === 3 ? obj.readFloatLE(0) : obj.readInt32LE(0));
            echo(0);
        }
        function request(a) {
            const ac = a[0], seq = ac & 15, fc = a[1];
            if (fc === 0) {
                stats.confirms++;
                if (ac & 0x10) { if (uAwait === seq) uAwait = null; return; }
                if (waiting && waiting.seq === seq) { const w = waiting; waiting = null; w.then?.(); }
                return;
            }
            const body = a.subarray(2), list = objectsAt(body);
            if (fc === 1) return read(seq, list);
            if (fc === 2) {
                const h = list[0];
                if (h.g === 80) { if (h.start === 7) { restart = false; stats.cleared++; } return respond(seq, Buffer.alloc(0)); }
                if (h.g === 50) { needTime = false; return respond(seq, Buffer.alloc(0)); }
                return respond(seq, Buffer.alloc(0), { iin2: 2 });
            }
            if (fc === 3 || fc === 4 || fc === 5) return controls(seq, fc, list, body);
            if (fc === 20) {
                respond(seq, Buffer.alloc(0));
                unsolTimer = setTimeout(() => { stats.unsolicited++; const [x, y] = iin(); uAwait = uSeq; app(Buffer.concat([Buffer.from([0xf0 | uSeq, 130, x, y, 2, 2, 0x17, 1, 7, 0x81]), time48(1730000000999)])); uSeq = (uSeq + 1) & 15; }, 100);
                return;
            }
            if (fc === 21) { clearTimeout(unsolTimer); return respond(seq, Buffer.alloc(0)); }
            respond(seq, Buffer.alloc(0), { iin2: 1 });
        }
        s.on("data", (d) => {
            buf = Buffer.concat([buf, d]);
            for (;;) {
                if (buf.length < 10) return;
                if (buf[0] !== 5 || buf[1] !== 0x64) { buf = buf.subarray(1); continue; }
                if (!crc(buf.subarray(0, 8)).equals(buf.subarray(8, 10))) return s.destroy();
                const user = buf[2] - 5, total = 10 + user + Math.ceil(user / 16) * 2;
                if (buf.length < total) return;
                const dst = buf.readUInt16LE(4), src = buf.readUInt16LE(6), ctrl = buf[3];
                const f = buf.subarray(0, total);
                buf = buf.subarray(total);
                if (dst !== ADDR) continue;
                master = src;
                if ((ctrl & 15) === 9) { stats.linkStatus++; s.write(frame(0x0b, src, ADDR, Buffer.alloc(0))); continue; }
                const parts = [];
                let at = 10, left = user;
                while (left > 0) {
                    const k = Math.min(left, 16), b = f.subarray(at, at + k);
                    if (!crc(b).equals(f.subarray(at + k, at + k + 2))) return s.destroy();
                    parts.push(b); at += k + 2; left -= k;
                }
                const data = Buffer.concat(parts), t = data[0];
                if (t & 0x40) gather = Buffer.alloc(0);
                gather = Buffer.concat([gather, data.subarray(1)]);
                if (t & 0x80) request(gather);
            }
        });
        s.on("close", () => clearTimeout(unsolTimer));
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { DNP3_HOST: `127.0.0.1:${port}` },
        close() { server.close(); },
        check: () => (!stats.linkStatus ? "no link status request came" : !stats.polls ? "no read came" : !stats.confirms ? "no confirmation came" : !stats.selects ? "no select came" : stats.bigFragments < 3 ? "the large read was not in fragments" : !stats.unsolicited ? "no unsolicited message went out" : null),
    };
}
