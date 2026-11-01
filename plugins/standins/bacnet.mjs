// A BACnet/IP device for bacnet.qwe, on node:dgram. Written from ANSI/ASHRAE 135: BVLC 0x81 with
// Original-Unicast (0x0A) and Original-Broadcast (0x0B), NPDU version 1, ReadProperty (12),
// ReadPropertyMultiple (14), WriteProperty (15), the context and application tags of clause 20,
// and the error classes and codes of clause 18.
//
// Device 1234 (vendor 999). A second device, 2345, answers Who-Is from behind a router: its I-Am
// carries SNET and SADR. A read of the whole object list aborts with segmentation-not-supported,
// as a small controller does, and index 0 gives its length. analog-value:3 has a priority array,
// as a commandable object has: writing null at a priority relinquishes it.
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
const bvlc = (fn, npdu) => { const h = Buffer.from([0x81, fn, 0, 0]); h.writeUInt16BE(npdu.length + 4, 2); return Buffer.concat([h, npdu]); };
const uintBytes = (v) => { const b = []; do { b.unshift(v & 255); v = Math.floor(v / 256); } while (v > 0); return b; };
function tag(n, ctx, len) { return len < 5 ? [n << 4 | (ctx ? 8 : 0) | len] : [n << 4 | (ctx ? 8 : 0) | 5, len]; }
const app = {
    real: (x) => { const b = Buffer.alloc(5); b[0] = 0x44; b.writeFloatBE(x, 1); return [...b]; },
    text: (s) => { const d = [0, ...Buffer.from(s)]; return [...tag(7, false, d.length), ...d]; },
    enum: (v) => { const d = uintBytes(v); return [...tag(9, false, d.length), ...d]; },
    uint: (v) => { const d = uintBytes(v); return [...tag(2, false, d.length), ...d]; },
    obj: (t, i) => { const v = ((t << 22) | i) >>> 0; return [0xc4, v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; },
    bits: (list) => { let b = 0; list.forEach((x, i) => { if (x) b |= 0x80 >> i; }); return [0x82, 8 - list.length, b]; },
    nul: () => [0],
};
const key = (t, i) => `${t}:${i}`;

function iAm(device, segmentation) {
    return [0x10, 0x00, ...app.obj(8, device), 0x22, 0x05, 0xc4, ...app.enum(segmentation), 0x21, 0xe7];
}

export async function start({ port }) {
    const seen = { whois: 0, reads: 0, writes: [], problems: [], list: 0 };
    const av3 = new Array(16).fill(null); const relinquish = 18.0;
    let bo2 = 0;
    const objects = [[8, 1234], [0, 1], [2, 3], [4, 2], [19, 1]];
    const props = new Map([
        [key(key(0, 1), 85), app.real(21.5)], [key(key(0, 1), 77), app.text("Room 12 temperature")], [key(key(0, 1), 117), app.enum(62)],
        [key(key(0, 1), 111), app.bits([false, false, false, false])], [key(key(8, 1234), 121), app.text("Stand-in Controls")],
    ]);
    const sock = createSocket("udp4");
    const send = (apdu, to) => sock.send(bvlc(0x0a, Buffer.from([1, 0, ...apdu])), to.port, to.address);
    sock.on("message", (m, from) => {
        if (m[0] !== 0x81 || m.readUInt16BE(2) !== m.length) return seen.problems.push("a bad BVLC header");
        if (m[1] !== 0x0a && m[1] !== 0x0b) return seen.problems.push(`BVLC function ${m[1]}`);
        if (m[4] !== 1) return seen.problems.push("NPDU version");
        const ctl = m[5]; let i = 6;
        if (ctl & 0x20) { const l = m[i + 2]; i += 3 + l + 1; }
        const a = m.subarray(i);
        if ((a[0] >> 4) === 1 && a[1] === 8) {
            seen.whois++;
            let low = 0, high = 4194303;
            if (a.length > 2) {
                const read = (o) => { const n = a[o] & 7; let v = 0; for (let k = 0; k < n; k++) v = v * 256 + a[o + 1 + k]; return [v, o + 1 + n]; };
                const [l, next] = read(2); const [h] = read(next); low = l; high = h;
            }
            if (m[1] !== 0x0b) seen.problems.push("Who-Is not sent as a broadcast");
            if (low <= 1234 && 1234 <= high) send(iAm(1234, 3), from);
            if (low <= 2345 && 2345 <= high) {
                const apdu = iAm(2345, 0);
                sock.send(bvlc(0x0a, Buffer.from([1, 0x08, 0x00, 0x0c, 1, 0x05, ...apdu])), from.port, from.address);
            }
            return;
        }
        if ((a[0] >> 4) !== 0) return;
        const id = a[2], svc = a[3];
        const body = a.subarray(4);
        const err = (cls, code) => send([0x50, id, svc, 0x91, cls, 0x91, code], from);
        const readCtx = (o) => { const n = body[o] & 7; let v = 0; for (let k = 0; k < n; k++) v = v * 256 + body[o + 1 + k]; return [v, o + 1 + n, body[o] >> 4]; };
        if (svc === 12 || svc === 15) {
            if (body[0] !== 0x0c) return send([0x60, id, 4], from);
            const raw = body.readUInt32BE(1), type = raw >>> 22, inst = raw & 0x3fffff;
            let [prop, o] = readCtx(5);
            let index = null;
            if (svc === 12 && o < body.length) { const r = readCtx(o); index = r[0]; o = r[1]; }
            if (prop > 4194303 || prop === 60000) return send([0x60, id, 8], from);
            const known = objects.some(([t, n]) => t === type && n === inst);
            if (!known) return err(1, 31);
            if (svc === 12) {
                seen.reads++;
                const ack = (v) => send([0x30, id, 12, 0x0c, ...body.subarray(1, 5), ...tag(1, true, uintBytes(prop).length), ...uintBytes(prop), ...(index != null ? [0x29, index] : []), 0x3e, ...v, 0x3f], from);
                if (type === 8 && prop === 76) {
                    if (index == null) { seen.list++; return send([0x70, id, 4], from); }
                    if (index === 0) return ack(app.uint(objects.length));
                    const o = objects[index - 1];
                    return o ? ack(app.obj(o[0], o[1])) : err(2, 42);
                }
                if (type === 19 && prop === 110) return ack([...app.text("Off"), ...app.text("Heat"), ...app.text("Cool")]);
                if (type === 2 && inst === 3 && prop === 85) return ack(app.real(av3.find((x) => x != null) ?? relinquish));
                if (type === 4 && prop === 85) return ack(app.enum(bo2));
                const v = props.get(key(key(type, inst), prop));
                return v ? ack(v) : err(2, 32);
            }
            if (body[o] !== 0x3e) return send([0x60, id, 4], from);
            o++;
            let value;
            if (body[o] === 0x00) { value = null; o += 1; }
            else if (body[o] === 0x44) { value = body.readFloatBE(o + 1); o += 5; }
            else if (body[o] >> 4 === 9) { value = body[o + 1]; o += 2; }
            else return err(2, 9);
            if (body[o] !== 0x3f) return send([0x60, id, 4], from);
            o++;
            const prio = o < body.length ? readCtx(o)[0] : 16;
            seen.writes.push({ type, inst, prop, value, prio });
            if (type === 0) return err(2, 40);
            if (type === 2) av3[prio - 1] = value;
            if (type === 4) bo2 = value;
            return send([0x20, id, 15], from);
        }
        if (svc === 14) {
            let o = 0; const out = [];
            while (o < body.length) {
                if (body[o] !== 0x0c) return send([0x60, id, 4], from);
                const obj = body.subarray(o + 1, o + 5), raw = obj.readUInt32BE(0), type = raw >>> 22, inst = raw & 0x3fffff;
                o += 5;
                if (body[o] !== 0x1e) return send([0x60, id, 4], from);
                o++;
                out.push(0x0c, ...obj, 0x1e);
                while (body[o] !== 0x1f) {
                    const r = readCtx(o); const prop = r[0]; o = r[1];
                    const v = type === 4 && prop === 85 ? app.enum(bo2) : props.get(key(key(type, inst), prop));
                    const pt = [...tag(2, true, uintBytes(prop).length), ...uintBytes(prop)];
                    if (v) out.push(...pt, 0x4e, ...v, 0x4f);
                    else out.push(...pt, 0x5e, 0x91, 2, 0x91, 32, 0x5f);
                }
                o++;
                out.push(0x1f);
            }
            return send([0x30, id, 14, ...out], from);
        }
        send([0x60, id, 9], from);
    });
    await bindUdp(sock, port);
    return {
        env: { BACNET_TO: `127.0.0.1:${port}`, BACNET_DEVICE: `127.0.0.1:${port}` },
        close() { setTimeout(() => sock.close(), 50); },
        check() {
            if (seen.problems.length) return `the device saw: ${seen.problems[0]}`;
            if (seen.whois === 0) return "the device got no Who-Is";
            if (seen.list === 0) return "the object list was never asked for whole";
            if (!seen.writes.some((w) => w.value === null && w.prio === 8)) return "the setpoint was never let go";
            return null;
        },
    };
}
