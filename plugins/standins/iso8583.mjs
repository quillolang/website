// A card authorization host for iso8583.qwe, speaking ISO 8583:1987 as many switches do: each
// message after a 2-byte big-endian length, the MTI and fields in ASCII, the bitmaps binary (a
// secondary bitmap when bit 1 is set). It answers 0100/0200 with 0110/0210 (response code 00 and an
// authorization code; 51 above 1000.00; 14 when the card number fails the Luhn check; 30 when the
// message cannot be read), 0400 with 0410 and 0800 with 0810, echoing the fields the 1987 standard
// says a response carries.
import { createServer } from "node:net";

// [type, length, prefix digits]: the 1987 data elements this host can read.
const F = {
    2: ["n", 19, 2], 3: ["n", 6, 0], 4: ["n", 12, 0], 5: ["n", 12, 0], 6: ["n", 12, 0], 7: ["n", 10, 0], 9: ["n", 8, 0], 10: ["n", 8, 0],
    11: ["n", 6, 0], 12: ["n", 6, 0], 13: ["n", 4, 0], 14: ["n", 4, 0], 15: ["n", 4, 0], 18: ["n", 4, 0], 19: ["n", 3, 0], 22: ["n", 3, 0],
    23: ["n", 3, 0], 24: ["n", 3, 0], 25: ["n", 2, 0], 26: ["n", 2, 0], 28: ["xn", 9, 0], 32: ["n", 11, 2], 33: ["n", 11, 2], 35: ["z", 37, 2],
    37: ["an", 12, 0], 38: ["an", 6, 0], 39: ["an", 2, 0], 41: ["ans", 8, 0], 42: ["ans", 15, 0], 43: ["ans", 40, 0], 44: ["an", 25, 2],
    45: ["an", 76, 2], 48: ["ans", 999, 3], 49: ["an", 3, 0], 52: ["b", 8, 0], 54: ["an", 120, 3], 55: ["b", 255, 3], 60: ["ans", 999, 3],
    61: ["ans", 999, 3], 62: ["ans", 999, 3], 63: ["ans", 999, 3], 64: ["b", 8, 0], 70: ["n", 3, 0], 90: ["n", 42, 0], 100: ["n", 11, 2],
    102: ["ans", 28, 2], 103: ["ans", 28, 2], 128: ["b", 8, 0],
};

function parse(buf) {
    const mti = buf.subarray(0, 4).toString("latin1");
    let at = 4;
    let bitmap = buf.subarray(at, at + 8); at += 8;
    if (bitmap[0] & 0x80) { bitmap = Buffer.concat([bitmap, buf.subarray(at, at + 8)]); at += 8; }
    const fields = {};
    for (let n = 2; n <= bitmap.length * 8; n++) {
        if (!(bitmap[(n - 1) >> 3] & (0x80 >> ((n - 1) & 7)))) continue;
        const d = F[n];
        if (!d) throw new Error(`field ${n} unknown`);
        let len = d[1];
        if (d[2]) { len = Number(buf.subarray(at, at + d[2]).toString("latin1")); at += d[2]; if (!(len <= d[1])) throw new Error(`field ${n} length`); }
        if (at + len > buf.length) throw new Error(`field ${n} truncated`);
        fields[n] = d[0] === "b" ? buf.subarray(at, at + len).toString("hex").toUpperCase() : buf.subarray(at, at + len).toString("latin1");
        at += len;
    }
    if (at !== buf.length) throw new Error("bytes left over");
    return { mti, fields };
}

function build(mti, fields) {
    const nums = Object.keys(fields).map(Number).sort((a, b) => a - b);
    const second = nums.some((n) => n > 64);
    const bitmap = Buffer.alloc(second ? 16 : 8);
    if (second) bitmap[0] |= 0x80;
    const parts = [];
    for (const n of nums) {
        bitmap[(n - 1) >> 3] |= 0x80 >> ((n - 1) & 7);
        const d = F[n], v = String(fields[n]);
        const data = d[0] === "b" ? Buffer.from(v, "hex") : Buffer.from(v, "latin1");
        if (d[2]) parts.push(Buffer.from(String(data.length).padStart(d[2], "0")));
        parts.push(data);
    }
    const body = Buffer.concat([Buffer.from(mti), bitmap, ...parts]);
    const len = Buffer.alloc(2); len.writeUInt16BE(body.length);
    return Buffer.concat([len, body]);
}

function luhn(pan) {
    let sum = 0;
    for (let i = 0; i < pan.length; i++) {
        let d = Number(pan[pan.length - 1 - i]);
        if (i % 2) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
    }
    return sum % 10 === 0;
}

const ECHO = [2, 3, 4, 7, 11, 12, 13, 32, 37, 41, 42, 49];

export async function start({ port }) {
    const seen = [];
    let auth = 100000;
    const server = createServer((sock) => {
        let buf = Buffer.alloc(0);
        sock.on("error", () => {});
        sock.on("data", (d) => {
            buf = Buffer.concat([buf, d]);
            while (buf.length >= 2) {
                const n = buf.readUInt16BE(0);
                if (buf.length < 2 + n) return;
                const msg = buf.subarray(2, 2 + n); buf = buf.subarray(2 + n);
                let m;
                try { m = parse(msg); } catch (e) {
                    const mti = msg.subarray(0, 4).toString("latin1");
                    sock.write(build(/^\d\d[0-9]\d$/.test(mti) ? mti.slice(0, 2) + String(Number(mti[2]) + 1) + mti[3] : "0810", { 39: "30" }));
                    continue;
                }
                seen.push(m);
                const reply = String(Number(m.mti) + 10).padStart(4, "0");
                const out = {};
                for (const f of ECHO) if (m.fields[f] != null) out[f] = m.fields[f];
                if (m.mti === "0800") { if (m.fields[70]) out[70] = m.fields[70]; out[39] = "00"; }
                else if (m.mti === "0100" || m.mti === "0200") {
                    if (!out[37]) out[37] = String(Date.now()).slice(-12);
                    const amount = Number(m.fields[4] ?? 0);
                    if (!m.fields[2] || !luhn(m.fields[2])) out[39] = "14";
                    else if (amount > 100000) out[39] = "51";
                    else { out[39] = "00"; out[38] = String(++auth).slice(-6); }
                } else out[39] = m.mti === "0400" ? "00" : "12";
                sock.write(build(reply, out));
            }
        });
    }).listen(port, "127.0.0.1");
    return {
        env: { ISO8583_HOST: `127.0.0.1:${port}` },
        close: () => server.close(),
        check: () => (seen.some((m) => m.mti === "0200") ? null : "the ISO 8583 host got no 0200"),
    };
}
