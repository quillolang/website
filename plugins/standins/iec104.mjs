// A controlled station for the iec104 plugin's test, written from IEC 60870-5-104 and -5-101 as the
// public guides describe them (the standards themselves are not free): APCI frames, I format
// refused before STARTDT, N(S) and N(R) checked on each frame and the link dropped on a mismatch, at
// most k=12 frames sent unacknowledged, so a client that does not acknowledge within w stalls, a
// TESTFR act of its own, C_IC_NA_1 answered with activation_con, 40 and more points of types
// 1, 3, 9, 11, 13, 36, 15, a sequence-coded frame (SQ=1), and activation_term; address 99 is
// unknown_address. C_SC, C_DC, C_SE_* with select before execute where the object demands it
// (2000), a locked object refusing its select (2001), unknown_object for others, C_RD_NA_1 and
// C_CS_NA_1. Object 9999 starts 33,000 frames, more than the 15-bit sequence holds.
//
//   start({ port }) -> { env: { IEC104_HOST }, close(), check() }
import { createServer } from "node:net";

const CA = 47;
const cp56 = (d) => { const ms = d.getUTCSeconds() * 1000 + d.getUTCMilliseconds(); return Buffer.from([ms & 255, ms >> 8, d.getUTCMinutes(), d.getUTCHours(), d.getUTCDate() | ((d.getUTCDay() || 7) << 5), d.getUTCMonth() + 1, d.getUTCFullYear() - 2000]); };
const ioa = (n) => Buffer.from([n & 255, (n >> 8) & 255, n >> 16]);
const asdu = (t, cot, ca, n, body, seq, org = 0) => Buffer.concat([Buffer.from([t, (seq ? 0x80 : 0) | n, cot, org, ca & 255, ca >> 8]), body]);
const f32 = (v) => { const b = Buffer.alloc(4); b.writeFloatLE(v); return b; };
const i16 = (v) => { const b = Buffer.alloc(2); b.writeInt16LE(v); return b; };
const i32 = (v) => { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; };

export async function start({ port }) {
    const stats = { starts: 0, iFrames: 0, sFrames: 0, stalls: 0, seqErrors: 0, tests: 0, commands: 0, flood: 0 };
    const values = new Map([[3000, 0]]);
    let clock = null;
    const server = createServer((s) => {
        s.on("error", () => {});
        let buf = Buffer.alloc(0), started = false, vs = 0, vr = 0, acked = 0, testTimer = null;
        const queue = [];
        const pending = () => (vs + 32768 - acked) % 32768;
        const pump = () => {
            while (queue.length && pending() < 12) {
                const a = queue.shift();
                const ns = (vs << 1) & 0xffff, nr = (vr << 1) & 0xffff;
                s.write(Buffer.concat([Buffer.from([0x68, a.length + 4, ns & 255, ns >> 8, nr & 255, nr >> 8]), a]));
                vs = (vs + 1) % 32768;
            }
            if (queue.length) stats.stalls++;
        };
        const send = (a) => { queue.push(a); pump(); };
        const confirm = (t, cot, ca, rest, neg) => send(asdu(t, cot | (neg ? 0x40 : 0), ca, 1, rest));
        function interrogate(ca, qoi, rest) {
            if (ca !== CA) return confirm(100, 46, ca, rest, true);
            confirm(100, 7, ca, rest);
            send(asdu(1, 20, CA, 2, Buffer.concat([ioa(100), Buffer.from([0x01]), ioa(101), Buffer.from([0x90])])));
            send(asdu(3, 20, CA, 1, Buffer.concat([ioa(200), Buffer.from([0x02])])));
            send(asdu(9, 20, CA, 1, Buffer.concat([ioa(300), i16(16384), Buffer.from([0])])));
            send(asdu(11, 20, CA, 1, Buffer.concat([ioa(301), i16(-321), Buffer.from([0])])));
            send(asdu(13, 20, CA, 1, Buffer.concat([ioa(302), f32(50.125), Buffer.from([0])])));
            send(asdu(13, 20, CA, 1, Buffer.concat([ioa(303), f32(0), Buffer.from([0x81])])));
            send(asdu(36, 20, CA, 1, Buffer.concat([ioa(400), f32(230.5), Buffer.from([0]), cp56(new Date("2026-11-01T09:30:15.250Z"))])));
            send(asdu(15, 20, CA, 1, Buffer.concat([ioa(500), i32(123456), Buffer.from([0x25])])));
            const body = [ioa(600)];
            for (let i = 0; i < 40; i++) body.push(i16(i * 100), Buffer.from([0]));
            send(asdu(11, 20, CA, 40, Buffer.concat(body), true));
            confirm(100, 10, CA, rest);
        }
        const selected = new Set();
        function command(t, ca, a) {
            stats.commands++;
            const obj = a[0] | (a[1] << 8) | (a[2] << 16);
            const rest = a;
            if (ca !== CA) return confirm(t, 46, ca, rest, true);
            const known = [1000, 2000, 2001, 3000, 3001, 3002, 9999];
            if (!known.includes(obj)) return confirm(t, 47, ca, rest, true);
            const se = t === 45 || t === 46 ? a[3] & 0x80 : t === 50 ? a[7] & 0x80 : a[5] & 0x80;
            if (obj === 2001 && se) return confirm(t, 7, ca, rest, true);
            if (se) { selected.add(obj); return confirm(t, 7, ca, rest); }
            if (obj === 2000 && !selected.delete(obj)) return confirm(t, 7, ca, rest, true);
            confirm(t, 7, ca, rest);
            if (t === 50) values.set(obj, a.readFloatLE(3));
            confirm(t, 10, ca, rest);
            send(asdu(30, 3, CA, 1, Buffer.concat([ioa(obj), Buffer.from([a[3] & 1]), cp56(new Date("2026-11-01T10:00:00.500Z"))])));
            if (obj === 9999) { stats.flood++; const go = (left) => { if (!left) return; const n = Math.min(left, 500); for (let i = 0; i < n; i++) queue.push(asdu(1, 1, CA, 1, Buffer.concat([ioa(5000), Buffer.from([i & 1])]))); pump(); setImmediate(() => { if (queue.length > 2000) { const w = setInterval(() => { if (queue.length < 1000) { clearInterval(w); go(left - n); } }, 5); } else go(left - n); }); }; go(33000); }
        }
        function frame(f) {
            if (f[0] === 0x07) { started = true; stats.starts++; s.write(Buffer.from([0x68, 4, 0x0b, 0, 0, 0])); testTimer = setTimeout(() => s.write(Buffer.from([0x68, 4, 0x43, 0, 0, 0])), 300); return; }
            if (f[0] === 0x13) { started = false; return s.write(Buffer.from([0x68, 4, 0x23, 0, 0, 0])); }
            if (f[0] === 0x43) { stats.tests++; return s.write(Buffer.from([0x68, 4, 0x83, 0, 0, 0])); }
            if (f[0] === 0x83) { stats.tests++; return; }
            if (f[0] & 1 && (f[0] & 3) === 1) { stats.sFrames++; acked = f.readUInt16LE(2) >> 1; return pump(); }
            if (f[0] & 1) return;
            if (!started) return s.destroy();
            stats.iFrames++;
            const ns = f.readUInt16LE(0) >> 1, nr = f.readUInt16LE(2) >> 1;
            if (ns !== vr) { stats.seqErrors++; return s.destroy(); }
            vr = (vr + 1) % 32768;
            acked = nr;
            const a = f.subarray(4), t = a[0], ca = a.readUInt16LE(4), body = a.subarray(6);
            if (t === 100) interrogate(ca, body[3], body);
            else if ([45, 46, 48, 49, 50].includes(t)) command(t, ca, body);
            else if (t === 102) {
                const obj = body[0] | (body[1] << 8) | (body[2] << 16);
                if (obj === 9000) send(asdu(13, 5, CA, 1, Buffer.concat([ioa(9000), f32(clock ?? 0), Buffer.from([0])])));
                else if (values.has(obj)) send(asdu(13, 5, CA, 1, Buffer.concat([ioa(obj), f32(values.get(obj)), Buffer.from([0])])));
                else confirm(102, 47, ca, body, true);
            } else if (t === 103) { clock = body.readUInt16LE(3) / 1000 + body[5] * 60; confirm(103, 7, ca, body); }
            else confirm(t, 44, ca, body, true);
            pump();
        }
        s.on("data", (d) => {
            buf = Buffer.concat([buf, d]);
            while (buf.length >= 2) {
                if (buf[0] !== 0x68) return s.destroy();
                const n = buf[1];
                if (buf.length < 2 + n) return;
                frame(buf.subarray(2, 2 + n));
                buf = buf.subarray(2 + n);
            }
        });
        s.on("close", () => clearTimeout(testTimer));
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { IEC104_HOST: `127.0.0.1:${port}` },
        close() { server.close(); },
        check: () => (!stats.starts ? "STARTDT never came" : stats.seqErrors ? `${stats.seqErrors} sequence errors` : !stats.sFrames ? "no S frame came" : !stats.tests ? "no TESTFR passed" : !stats.flood ? "the wrap was not reached" : null),
    };
}
