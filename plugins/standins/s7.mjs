// A small Siemens S7 PLC for the s7 plugin's test, on node:net: ISO-on-TCP (RFC 1006 TPKT,
// ISO 8073 COTP class 0) carrying S7comm. It takes a connection only for rack 0, slot 1 (a
// S7-1200), negotiates a PDU of 240 bytes (as an S7-300 does), and answers Setup
// communication, Read Var and Write Var (up to 20 items, every item and answer kept inside the
// PDU: one that is not is refused with error class 0x85) and the user-data SZL reads for the
// CPU's mode (0x0424), module identification (0x0011) and component identification (0x001C,
// sent in two fragments as it is longer than the PDU). Its memory: DB1 (64 bytes), DB2 (300),
// DB3 (read-only), inputs, outputs, merkers, timers and counters, with a filling line's values.
import { createServer } from "node:net";

const PDU = 240;

function s7string(max, text) {
    const b = Buffer.alloc(max + 2);
    b[0] = max; b[1] = text.length; b.write(text, 2, "latin1");
    return b;
}
const bcd = (n) => ((Math.floor(n / 10) % 10) << 4) | (n % 10);

function memory() {
    const db1 = Buffer.alloc(64);
    db1[0] = 0x01;                       // DBX0.0 running, DBX0.1 fault
    db1.writeInt16BE(1450, 2);           // DBW2 speed (INT)
    db1.writeFloatBE(72.5, 4);           // DBD4 temperature (REAL)
    db1.writeInt32BE(123456, 8);         // DBD8 bottles (DINT)
    s7string(20, "Line 3 filler").copy(db1, 12); // DBB12 STRING[20]
    db1.writeInt16BE(1500, 34);          // DBW34 set point (INT)
    // DBB36 DATE_AND_TIME 2026-10-30 08:15:00.000, a Friday (weekday 6)
    Buffer.from([bcd(26), bcd(10), bcd(30), bcd(8), bcd(15), bcd(0), 0x00, 0x06]).copy(db1, 36);
    const db2 = Buffer.alloc(300);
    for (let i = 0; i < 10; i++) db2.writeFloatBE(1.5 + i, i * 4);   // DBD0 REAL[10]
    s7string(200, "Recipe B: 0.5 l PET, cap 28 mm, fill 498 ml, torque 1.6 Nm, label front and back, date code on the cap").copy(db2, 40);
    db2.writeInt32BE(90000, 242);        // DBD242 TIME T#1M30S
    db2.writeUInt16BE(Math.round((Date.UTC(2026, 9, 30) - Date.UTC(1990, 0, 1)) / 86400000), 246); // DATE
    const db3 = Buffer.from("READONLY", "latin1");
    const inputs = Buffer.alloc(16); inputs[0] = 0b00000101; inputs.writeUInt16BE(0x1234, 2);
    const outputs = Buffer.alloc(16);
    const merkers = Buffer.alloc(64); merkers.writeInt16BE(42, 10); merkers.writeFloatBE(3.25, 20);
    const timers = Buffer.alloc(32); timers.writeUInt16BE(0x2123, 2);   // T1: 123 s (base 1 s)
    const counters = Buffer.alloc(32); counters.writeUInt16BE(0x0042, 2); // C1: 42
    return { dbs: new Map([[1, db1], [2, db2], [3, db3]]), readOnly: new Set([3]), inputs, outputs, merkers, timers, counters };
}

function szlRecords(id) {
    const text = (index, s, len) => { const b = Buffer.alloc(len); b.writeUInt16BE(index, 0); b.write(s, 2, "latin1"); return b; };
    if (id === 0x0424) {
        const r = Buffer.alloc(20);
        r.writeUInt16BE(0x4302, 0); r[2] = 0xff; r[3] = 0x08; // bzu-id: RUN (8) in bits 0-3, as CPUs send it
        return { len: 20, recs: [r] };
    }
    if (id === 0x0011) {
        const code = "6ES7 214-1AG40-0XB0 ";
        const r1 = text(1, code, 28); r1.writeUInt16BE(0, 22); r1.writeUInt16BE(0, 24); r1.writeUInt16BE(5, 26);
        const r6 = text(6, code, 28); r6.writeUInt16BE(0, 22); r6.writeUInt16BE(0, 24); r6.writeUInt16BE(5, 26);
        const r7 = text(7, " ".repeat(20), 28); r7.writeUInt16BE(0, 22); r7[24] = 0x56; r7[25] = 4; r7[26] = 4; r7[27] = 0;
        return { len: 28, recs: [r1, r6, r7] };
    }
    if (id === 0x001c) {
        const names = [[1, "Line3_PLC"], [2, "PLC_1"], [3, ""], [4, "Original Siemens Equipment"], [5, "S C-X4U421302014"], [7, "CPU 1214C DC/DC/DC"], [8, "SMC_c4f1b2a0"], [9, ""], [10, ""], [11, "Hall 2, line 3"]];
        return { len: 34, recs: names.map(([i, s]) => text(i, s, 34)) };
    }
    return null;
}

export async function start({ port }) {
    const mem = memory();
    const seen = { connects: 0, refused: 0, setups: 0, reads: 0, writes: 0, szl: 0, fragments: 0, problems: [] };
    const area = (code, db) => {
        if (code === 0x84) return mem.dbs.get(db) ?? null;
        return { 0x81: mem.inputs, 0x82: mem.outputs, 0x83: mem.merkers, 0x80: mem.inputs, 0x1d: mem.timers, 0x1c: mem.counters }[code] ?? null;
    };
    // bytes per element for each transport size of a request item
    const elem = { 0x01: 1, 0x02: 1, 0x03: 1, 0x04: 2, 0x05: 2, 0x06: 4, 0x07: 4, 0x08: 4, 0x1c: 2, 0x1d: 2 };

    const server = createServer((sock) => {
        let buf = Buffer.alloc(0), connected = false, pdu = 0, partial = [];
        const tpkt = (payload) => { const h = Buffer.from([3, 0, 0, 0]); h.writeUInt16BE(payload.length + 4, 2); sock.write(Buffer.concat([h, payload])); };
        const dt = (s7) => tpkt(Buffer.concat([Buffer.from([0x02, 0xf0, 0x80]), s7]));
        const ack = (ref, params, data, ec = 0, code = 0) => {
            const h = Buffer.alloc(12); h[0] = 0x32; h[1] = 3; h.writeUInt16BE(ref, 4);
            h.writeUInt16BE(params.length, 6); h.writeUInt16BE(data.length, 8); h[10] = ec; h[11] = code;
            dt(Buffer.concat([h, params, data]));
        };
        const userdata = (ref, params, data) => {
            const h = Buffer.alloc(10); h[0] = 0x32; h[1] = 7; h.writeUInt16BE(ref, 4);
            h.writeUInt16BE(params.length, 6); h.writeUInt16BE(data.length, 8);
            dt(Buffer.concat([h, params, data]));
        };
        let pending = null; // the rest of an SZL answer, sent on the follow-up request
        const onS7 = (p) => {
            if (p[0] !== 0x32) { seen.problems.push("not an S7 PDU"); sock.destroy(); return; }
            const rosctr = p[1], ref = p.readUInt16BE(4), plen = p.readUInt16BE(6), dlen = p.readUInt16BE(8);
            const hl = rosctr === 2 || rosctr === 3 ? 12 : 10;
            const params = p.subarray(hl, hl + plen), data = p.subarray(hl + plen, hl + plen + dlen);
            if (hl + plen + dlen !== p.length) { seen.problems.push("an S7 PDU whose lengths do not add up"); }
            if (pdu && p.length > pdu) { seen.problems.push(`a request of ${p.length} bytes, past the PDU of ${pdu}`); return ack(ref, Buffer.from([params[0] ?? 0, 0]), Buffer.alloc(0), 0x85, 0x00); }
            if (rosctr === 1 && params[0] === 0xf0) {
                seen.setups++;
                pdu = Math.min(params.readUInt16BE(6), PDU);
                const r = Buffer.from([0xf0, 0, 0, 1, 0, 1, 0, 0]); r.writeUInt16BE(pdu, 6);
                return ack(ref, r, Buffer.alloc(0));
            }
            if (!pdu) { seen.problems.push("a request before Setup communication"); sock.destroy(); return; }
            if (rosctr === 1 && (params[0] === 0x04 || params[0] === 0x05)) {
                const fn = params[0], n = params[1];
                if (n > 20) { seen.problems.push(`${n} items in one request (20 at most)`); return ack(ref, Buffer.from([fn, 0]), Buffer.alloc(0), 0x85, 0x00); }
                const items = [];
                for (let i = 0; i < n; i++) {
                    const s = params.subarray(2 + 12 * i, 14 + 12 * i);
                    if (s[0] !== 0x12 || s[1] !== 0x0a || s[2] !== 0x10) { seen.problems.push("an item that is not S7ANY"); return ack(ref, Buffer.from([fn, 0]), Buffer.alloc(0), 0x84, 0x04); }
                    items.push({ ts: s[3], count: s.readUInt16BE(4), db: s.readUInt16BE(6), area: s[8], addr: (s[9] << 16) | (s[10] << 8) | s[11] });
                }
                const place = (it) => {
                    const mem = area(it.area, it.db);
                    if (!mem) return { rc: 0x0a };
                    const tc = it.area === 0x1c || it.area === 0x1d;
                    const start = tc ? it.addr * 2 : it.ts === 0x01 ? it.addr >> 3 : it.addr >> 3;
                    const len = it.ts === 0x01 ? 1 : (elem[it.ts] ?? 1) * it.count;
                    if (it.ts === 0x01 && it.count !== 1) return { rc: 0x06 };
                    if (start + len > mem.length) return { rc: 0x05 };
                    return { rc: 0xff, mem, start, len, bit: it.ts === 0x01 ? it.addr & 7 : null, tc };
                };
                if (fn === 0x04) {
                    seen.reads++;
                    const out = [];
                    items.forEach((it, i) => {
                        const pl = place(it);
                        if (pl.rc !== 0xff) { out.push(Buffer.from([pl.rc, 0, 0, 0])); return; }
                        let d, ts, l;
                        if (pl.bit != null) { d = Buffer.from([(pl.mem[pl.start] >> pl.bit) & 1]); ts = 0x03; l = 1; }
                        else { d = Buffer.from(pl.mem.subarray(pl.start, pl.start + pl.len)); ts = pl.tc ? 0x09 : 0x04; l = pl.tc ? d.length : d.length * 8; }
                        const h = Buffer.from([0xff, ts, 0, 0]); h.writeUInt16BE(l, 2);
                        out.push(h, d);
                        if (d.length % 2 === 1 && i < items.length - 1) out.push(Buffer.from([0]));
                    });
                    const body = Buffer.concat(out);
                    if (12 + 2 + body.length > pdu) { seen.problems.push(`a read whose answer (${14 + body.length} bytes) would not fit the PDU of ${pdu}`); return ack(ref, Buffer.from([0x04, 0]), Buffer.alloc(0), 0x85, 0x00); }
                    return ack(ref, Buffer.from([0x04, n]), body);
                }
                seen.writes++;
                const rcs = [];
                let at = 0;
                for (let i = 0; i < n; i++) {
                    const it = items[i];
                    const ts = data[at + 1], l = data.readUInt16BE(at + 2);
                    const bytes = ts === 0x03 || ts === 0x04 || ts === 0x05 ? Math.ceil(l / 8) : l;
                    const d = data.subarray(at + 4, at + 4 + bytes);
                    at += 4 + bytes + (bytes % 2 === 1 && i < n - 1 ? 1 : 0);
                    const pl = place(it);
                    if (pl.rc !== 0xff) { rcs.push(pl.rc); continue; }
                    if (it.area === 0x84 && mem.readOnly.has(it.db)) { rcs.push(0x03); continue; }
                    if (pl.bit != null) {
                        if (ts !== 0x03 || l !== 1) { rcs.push(0x07); continue; }
                        if (d[0] & 1) pl.mem[pl.start] |= 1 << pl.bit; else pl.mem[pl.start] &= ~(1 << pl.bit);
                    } else {
                        if (d.length !== pl.len) { rcs.push(0x07); continue; }
                        d.copy(pl.mem, pl.start);
                    }
                    rcs.push(0xff);
                }
                return ack(ref, Buffer.from([0x05, n]), Buffer.from(rcs));
            }
            if (rosctr === 7 && params[0] === 0x00 && params[1] === 0x01 && params[2] === 0x12) {
                const type = params[5], sub = params[6];
                if (type !== 0x44 || sub !== 0x01) { seen.problems.push("a user-data request other than Read SZL"); return; }
                const resp = (seq, dur, last, err, body) => {
                    const pr = Buffer.from([0x00, 0x01, 0x12, 0x08, 0x12, 0x84, 0x01, seq, dur, last, err >> 8, err & 0xff]);
                    userdata(ref, pr, body);
                };
                if (params[3] === 0x08) { // a follow-up for the rest of an answer
                    if (!pending) return resp(params[7], 0, 0, 0xd403, Buffer.from([0x0a, 0, 0, 0]));
                    seen.fragments++;
                    const chunk = pending; pending = null;
                    const h = Buffer.from([0xff, 0x09, 0, 0]); h.writeUInt16BE(chunk.length, 2);
                    return resp(params[7], 0, 0, 0, Buffer.concat([h, chunk]));
                }
                seen.szl++;
                const id = data.readUInt16BE(4), index = data.readUInt16BE(6);
                const list = szlRecords(id);
                if (!list) return resp(0, 0, 0, 0xd401, Buffer.from([0x0a, 0, 0, 0]));
                const all = Buffer.alloc(8); all.writeUInt16BE(id, 0); all.writeUInt16BE(index, 2); all.writeUInt16BE(list.len, 4); all.writeUInt16BE(list.recs.length, 6);
                const whole = Buffer.concat([all, ...list.recs]);
                const room = pdu - 10 - 12 - 4;
                const first = whole.subarray(0, Math.min(room, whole.length));
                if (whole.length > room) pending = Buffer.from(whole.subarray(room));
                const h = Buffer.from([0xff, 0x09, 0, 0]); h.writeUInt16BE(first.length, 2);
                return resp(0x05, pending ? 0x2c : 0, pending ? 1 : 0, 0, Buffer.concat([h, first]));
            }
            seen.problems.push(`an S7 message the stand-in does not know (type ${rosctr}, function 0x${(params[0] ?? 0).toString(16)})`);
        };
        const onTpkt = (t) => {
            const li = t[0], kind = t[1];
            if (!connected) {
                if (kind !== 0xe0) { seen.problems.push("data before the COTP connection request"); sock.destroy(); return; }
                let dst = null, i = 7;
                while (i < li + 1) { const code = t[i], l = t[i + 1]; if (code === 0xc2) dst = t.readUInt16BE(i + 2); i += 2 + l; }
                if (dst == null || (dst & 0xff) !== 0x01) {
                    seen.refused++;
                    tpkt(Buffer.from([6, 0x80, t[4], t[5], 0, 0x44, 0x00]));
                    sock.end();
                    return;
                }
                seen.connects++;
                connected = true;
                const cc = Buffer.from(t.subarray(0, li + 1)); cc[1] = 0xd0; cc[2] = t[4]; cc[3] = t[5]; cc[4] = 0x00; cc[5] = 0x44;
                tpkt(cc);
                return;
            }
            if (kind !== 0xf0) { if (kind === 0x80) sock.end(); return; }
            partial.push(t.subarray(li + 1));
            if (t[2] & 0x80) { const p = Buffer.concat(partial); partial = []; onS7(p); }
        };
        sock.on("data", (d) => {
            buf = Buffer.concat([buf, d]);
            while (buf.length >= 4) {
                if (buf[0] !== 3) { seen.problems.push("not a TPKT"); sock.destroy(); return; }
                const len = buf.readUInt16BE(2);
                if (buf.length < len) break;
                const t = buf.subarray(4, len); buf = buf.subarray(len);
                onTpkt(t);
            }
        });
        sock.on("error", () => {});
    });
    // listened on again for a few seconds while the port is still held by the last example
    for (let tries = 0; ; tries++) {
        const err = await new Promise((r) => { server.once("error", r); server.once("listening", () => r(null)); server.listen(port, "127.0.0.1"); });
        if (!err) break;
        if (err.code !== "EADDRINUSE" || tries > 40) throw err;
        await new Promise((r) => setTimeout(r, 100));
    }
    return {
        env: { S7_HOST: `127.0.0.1:${port}`, S7_RACK: "0", S7_SLOT: "1" },
        close: () => server.close(),
        check: () => {
            if (seen.problems.length) return `the S7 stand-in saw: ${[...new Set(seen.problems)].join("; ")}`;
            if (!seen.setups) return "the S7 stand-in never got a Setup communication";
            if (!seen.reads || !seen.writes) return `the S7 stand-in got ${seen.reads} reads and ${seen.writes} writes`;
            if (!seen.szl || !seen.fragments) return "the S7 stand-in got no SZL read with a follow-up fragment";
            return null;
        },
    };
}
