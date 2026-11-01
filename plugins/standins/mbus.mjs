// An M-Bus level converter on TCP with meters behind it, for mbus.qwe. Written from EN 13757-2 and
// -3: short frames (0x10 C A CS 0x16), long frames (0x68 L L 0x68 C A CI ... CS 0x16), E5 as the
// single-character acknowledgement.
//
// Meter 5 answers SND_NKE and REQ_UD2 with one telegram; meter 6 answers three telegrams, with
// DIF 0x1F asking for more, and repeats a telegram when the FCB bit did not toggle, as the link
// layer says. Meter 7's telegram has a wrong checksum. Selection by secondary address (CI 0x52 to
// address 253) answers E5 when the id matches, with F as a wildcard digit, and silently otherwise.
import { createServer } from "node:net";

const sum = (b) => b.reduce((a, x) => (a + x) & 255, 0);
function long(c, a, ci, data) {
    const body = [c, a, ci, ...data];
    return Buffer.from([0x68, body.length, body.length, 0x68, ...body, sum(body), 0x16]);
}
// id 12345678, PAD, version 1, water, access 0x55, status 0.
const header = (access) => [0x78, 0x56, 0x34, 0x12, 0x24, 0x40, 0x01, 0x07, access, 0, 0, 0];
const meterFive = [...header(0x55), 0x03, 0x13, 0x15, 0x31, 0x00, 0x02, 0x5a, 0x2d, 0x01, 0x42, 0x13, 0x15, 0x31];
const history = (n, more) => [...header(0x20 + n), 0x04, 0x13, 100 + n, 0, 0, 0, 0x44, 0x13, 200 + n, 0, 0, 0, ...(more ? [0x1f] : [])];

export async function start({ port }) {
    const seen = { nke: new Set(), ud2: 0, selected: 0, frames: [], problems: [] };
    const addresses = new Map([[5, 5], [6, 6], [7, 7]]);
    let selected = false; // the bus keeps it, whichever connection asked
    const server = createServer((s) => {
        s.on("error", () => {});
        let buf = Buffer.alloc(0);
        const logger = { telegram: 0, fcb: null };
        const answer = (a, c) => {
            const m = a === 0xfd ? (selected ? 5 : null) : addresses.get(a);
            if (m == null) return;
            if ((c & 0x4f) !== 0x4b) return;
            seen.ud2++;
            if (m === 5) s.write(long(0x08, a === 0xfd ? 5 : a, 0x72, meterFive));
            if (m === 7) { const f = long(0x08, a, 0x72, meterFive); f[f.length - 2] ^= 0xff; s.write(f); }
            if (m === 6) {
                const fcb = c & 0x20;
                if (logger.fcb !== null && fcb === logger.fcb) { /* a repeat: the same telegram */ } else if (logger.fcb !== null) logger.telegram++;
                logger.fcb = fcb;
                s.write(long(0x08, a, 0x72, history(logger.telegram, logger.telegram < 2)));
            }
        };
        s.on("data", (d) => {
            buf = Buffer.concat([buf, d]);
            for (;;) {
                if (buf.length === 0) return;
                if (buf[0] === 0x10) {
                    if (buf.length < 5) return;
                    const [, c, a, cs, stop] = buf;
                    buf = buf.subarray(5);
                    if (stop !== 0x16 || ((c + a) & 255) !== cs) { seen.problems.push("a short frame with a bad checksum"); continue; }
                    seen.frames.push(c);
                    if (c === 0x40) {
                        if (a === 0xfd) { if (selected) s.write(Buffer.from([0xe5])); continue; }
                        const target = addresses.get(a);
                        if (target != null) { seen.nke.add(a); logger.telegram = 0; logger.fcb = null; s.write(Buffer.from([0xe5])); }
                    } else answer(a, c);
                } else if (buf[0] === 0x68) {
                    if (buf.length < 4) return;
                    const total = buf[1] + 6;
                    if (buf.length < total) return;
                    const f = buf.subarray(0, total);
                    buf = buf.subarray(total);
                    if (f[2] !== f[1] || f[3] !== 0x68 || f[total - 1] !== 0x16 || sum(f.subarray(4, total - 2)) !== f[total - 2]) { seen.problems.push("a long frame with bad framing"); continue; }
                    const [c, a, ci] = [f[4], f[5], f[6]];
                    const data = f.subarray(7, total - 2);
                    if (c === 0x53 && a === 0xfd && ci === 0x52) {
                        const id = Buffer.from(data.subarray(0, 4)).reverse().toString("hex");
                        const match = [..."12345678"].every((d, i) => id[i] === "f" || id[i] === d);
                        const man = data.readUInt16LE(4);
                        const manOk = man === 0xffff || man === 0x4024;
                        selected = match && manOk;
                        if (selected) { seen.selected++; s.write(Buffer.from([0xe5])); }
                    } else if (c === 0x53 && ci === 0x51 && data[0] === 0x01 && data[1] === 0x7a && addresses.has(a)) {
                        const m = addresses.get(a);
                        addresses.delete(a);
                        addresses.set(data[2], m);
                        s.write(Buffer.from([0xe5]));
                    }
                } else buf = buf.subarray(1);
            }
        });
    });
    await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
    return {
        env: { MBUS_GATEWAY: `127.0.0.1:${port}` },
        close() { server.close(); },
        check() {
            if (seen.problems.length) return `the meters saw: ${seen.problems[0]}`;
            if (!seen.nke.has(5) || seen.ud2 === 0) return "the example never read a meter";
            if (seen.selected === 0) return "the example never selected a meter by its secondary address";
            return null;
        },
    };
}
