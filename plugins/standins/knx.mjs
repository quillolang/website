// A KNX IP interface for knx.qwe, on node:dgram. Written from KNX specification 3/8/2 (Core) and
// 3/8/4 (Tunnelling), and 3/6/3 (cEMI): the 06 10 header, CONNECT_REQUEST with a tunnel CRI,
// TUNNELLING_REQUEST with connection header (4, channel, sequence, 0), the ack with the same
// sequence, and L_Data.con coming back after L_Data.req.
//
// The gateway checks what a real one checks: a channel it gave out, sequence numbers from 0, and
// each of its own sends acknowledged. It drops the ack of one request, so the plugin must repeat
// it with the same number; it sends one indication twice, which must be taken once; a telegram to
// group 9/1/1 is confirmed with the error bit. `port + 1` answers E_NO_MORE_CONNECTIONS.
import { createSocket } from "node:dgram";

const H = (service, body) => { const b = Buffer.alloc(6 + body.length); b[0] = 6; b[1] = 0x10; b.writeUInt16BE(service, 2); b.writeUInt16BE(b.length, 4); body.copy(b, 6); return b; };
const group = (a, b, c) => (a << 11) | (b << 8) | c;
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

export async function start({ port, ports }) {
    const seen = { writes: [], reads: 0, repeats: 0, problems: [], disconnects: 0, acks: new Set(), heard: 0 };
    const store = new Map([[group(3, 1, 7), Buffer.from([0x0c, 0x33])]]);
    const gw = createSocket("udp4"), busy = createSocket("udp4");
    let client = null, channel = 7, expected = 0, mine = 0, droppedOne = false, repeatedOne = false, told = false;

    const tunnel = (cemi) => {
        const b = Buffer.concat([Buffer.from([4, channel, mine, 0]), cemi]);
        mine = (mine + 1) & 255;
        gw.send(H(0x0420, b), client.port, client.address);
        return b;
    };
    const groupFrame = (code, ctrl1, src, dst, tp) => {
        const c = Buffer.alloc(9 + tp.length);
        c[0] = code; c[1] = 0; c[2] = ctrl1; c[3] = 0xe0; c.writeUInt16BE(src, 4); c.writeUInt16BE(dst, 6); c[8] = tp.length - 1; tp.copy(c, 9);
        return c;
    };

    gw.on("message", (m, from) => {
        if (m[0] !== 6 || m[1] !== 0x10 || m.readUInt16BE(4) !== m.length) return seen.problems.push("a packet with a bad header");
        const service = m.readUInt16BE(2), b = m.subarray(6);
        if (service === 0x0201) {
            const dib = Buffer.alloc(54); dib[0] = 54; dib[1] = 1; dib[2] = 2; dib.writeUInt16BE(0x11fa, 4);
            Buffer.from("0001a1b2c3d4", "hex").copy(dib, 8); Buffer.from("001a2b3c4d5e", "hex").copy(dib, 18); dib.write("Stand-in IP Interface", 24, "latin1");
            gw.send(H(0x0202, Buffer.concat([Buffer.from([8, 1, 127, 0, 0, 1, 0x0e, 0x57]), dib])), from.port, from.address);
        } else if (service === 0x0205) {
            if (b.length !== 20 || b[16] !== 4 || b[17] !== 4 || b[18] !== 2) { seen.problems.push("a connect request without a tunnel CRI"); gw.send(H(0x0206, Buffer.from([0, 0x22])), from.port, from.address); return; }
            client = from; expected = 0; mine = 0;
            const res = Buffer.from([channel, 0, 8, 1, 127, 0, 0, 1, 0x0e, 0x57, 4, 4, 0x11, 0xfa]);
            gw.send(H(0x0206, res), from.port, from.address);
        } else if (service === 0x0420) {
            if (b[1] !== channel) return seen.problems.push(`tunnel request on channel ${b[1]}`);
            const seq = b[2], cemi = b.subarray(b[0]);
            if (seq === (expected - 1 & 255)) { seen.repeats++; }
            else if (seq !== expected) return seen.problems.push(`sequence ${seq}, expected ${expected}`);
            // The ack of the very first telegram goes missing, once.
            if (!droppedOne) { droppedOne = true; expected = (expected + 1) & 255; return; }
            if (seq === expected) expected = (expected + 1) & 255;
            gw.send(H(0x0421, Buffer.from([4, channel, seq, 0])), from.port, from.address);
            if (cemi[0] !== 0x11) return seen.problems.push(`cEMI code ${cemi[0]}`);
            const add = 2 + cemi[1];
            const dst = cemi.readUInt16BE(add + 4), len = cemi[add + 6], tp = cemi.subarray(add + 7);
            if (tp.length !== len + 1 || (cemi[add + 1] & 0x80) === 0) seen.problems.push("a malformed L_Data.req");
            const apci = ((tp[0] & 3) << 8) | tp[1];
            const confirm = Buffer.from(cemi); confirm[0] = 0x2e; confirm.writeUInt16BE(0x11fa, add + 2);
            if (dst === group(9, 1, 1)) confirm[add] |= 1;
            setTimeout(() => {
                tunnel(confirm);
                if ((apci & 0x3c0) === 0x080) {
                    const data = tp.length > 2 ? Buffer.from(tp.subarray(2)) : Buffer.from([tp[1] & 0x3f]);
                    store.set(dst, { small: tp.length === 2, data });
                    seen.writes.push({ dst, data: data.toString("hex") });
                } else if ((apci & 0x3c0) === 0) {
                    seen.reads++;
                    const v = store.get(dst);
                    if (!v) return;
                    const s = Buffer.isBuffer(v) ? { small: false, data: v } : v;
                    const answer = s.small ? Buffer.from([0, 0x40 | s.data[0]]) : Buffer.concat([Buffer.from([0, 0x40]), s.data]);
                    tunnel(groupFrame(0x29, 0xbc, 0x1105, dst, answer));
                }
                // The first time, a wall switch and a thermostat speak up, one of them twice.
                if (!told) {
                    told = true;
                    tunnel(groupFrame(0x29, 0xbc, 0x1107, group(1, 2, 9), Buffer.from([0, 0x81])));
                    const again = tunnel(groupFrame(0x29, 0xbc, 0x1105, group(3, 1, 7), Buffer.from([0, 0x80, 0x0c, 0x33])));
                    gw.send(H(0x0420, again), client.port, client.address);
                }
            }, 5);
        } else if (service === 0x0421) {
            seen.acks.add(b[2]);
        } else if (service === 0x0207) {
            gw.send(H(0x0208, Buffer.from([b[0], b[0] === channel ? 0 : 0x21])), from.port, from.address);
        } else if (service === 0x0209) {
            seen.disconnects++;
            gw.send(H(0x020a, Buffer.from([b[0], 0])), from.port, from.address);
        }
    });
    busy.on("message", (m, from) => { busy.send(H(0x0206, Buffer.from([0, 0x24])), from.port, from.address); });
    await bindUdp(gw, port);
    await bindUdp(busy, ports[1]);
    return {
        env: { KNX_GATEWAY: `127.0.0.1:${port}`, KNX_BUSY_GATEWAY: `127.0.0.1:${ports[1]}`, KNX_DEAD_GATEWAY: `127.0.0.1:${ports[2]}` },
        close() { setTimeout(() => { gw.close(); busy.close(); }, 50); },
        check() {
            if (seen.problems.length) return `the gateway saw: ${seen.problems[0]}`;
            if (seen.repeats === 0) return "the telegram whose ack went missing was never repeated";
            if (seen.acks.size === 0) return "the plugin never acknowledged the gateway's telegrams";
            if (!seen.writes.some((w) => w.data === "0c33")) return "the setpoint never reached the bus";
            return null;
        },
    };
}
