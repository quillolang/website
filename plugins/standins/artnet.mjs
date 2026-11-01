// An Art-Net node and an sACN receiver for artnet.qwe, on node:dgram. Written from the Art-Net 4
// specification: packets start "Art-Net\0", OpCode little-endian, ProtVer 14 big-endian; ArtDMX has
// Sequence, Physical, SubUni, Net and a big-endian even Length; a node answers ArtPoll with a
// 239-byte ArtPollReply. And from ANSI E1.31-2018: root, framing and DMP layers with their flags
// and lengths. The node keeps what it was sent and refuses (by counting) what a real one would
// ignore: an odd length, a sequence running backwards.
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

function pollReply() {
    const b = Buffer.alloc(239);
    b.write("Art-Net\0", 0, "latin1");
    b.writeUInt16LE(0x2100, 8);
    [127, 0, 0, 1].forEach((x, i) => { b[10 + i] = x; });
    b.writeUInt16LE(6454, 14);
    b[16] = 1; b[17] = 4; b[18] = 0; b[19] = 1;
    b.writeUInt16BE(0x1234, 20);
    b[24] = 0x7a; b[25] = 0x70;
    b.write("Stand-in", 26, "latin1");
    b.write("Stand-in four-port node", 44, "latin1");
    b.write("#0001 [0042] Power On Tests successful", 108, "latin1");
    b.writeUInt16BE(2, 172);
    b[174] = 0x80; b[175] = 0x80;
    b[190] = 3; b[191] = 4;
    b[200] = 0;
    [0, 0x1a, 0x2b, 0x3c, 0x4d, 0x5e].forEach((x, i) => { b[201 + i] = x; });
    return b;
}

export async function start({ port, ports }) {
    const seen = { dmx: [], sacn: [], polls: 0, problems: [] };
    const node = createSocket("udp4"), sacn = createSocket("udp4");
    const last = new Map();
    node.on("message", (m, from) => {
        if (m.subarray(0, 8).toString("latin1") !== "Art-Net\0") return seen.problems.push("a packet with no Art-Net header");
        const op = m.readUInt16LE(8);
        if (m.readUInt16BE(10) !== 14) seen.problems.push(`ProtVer ${m.readUInt16BE(10)}`);
        if (op === 0x2000) { seen.polls++; node.send(pollReply(), from.port, from.address); return; }
        if (op !== 0x5000) return;
        const length = m.readUInt16BE(16);
        const universe = (m[15] << 8) | m[14];
        if (length % 2 || length < 2 || length > 512 || m.length !== 18 + length) seen.problems.push(`ArtDMX length ${length} in ${m.length} bytes`);
        const prev = last.get(universe);
        if (m[12] === 0) seen.problems.push("sequence 0 turns the node's check off");
        if (prev != null && m[12] !== (prev === 255 ? 1 : prev + 1)) seen.problems.push(`sequence ${m[12]} after ${prev} on universe ${universe}`);
        last.set(universe, m[12]);
        seen.dmx.push({ universe, sequence: m[12], data: m.subarray(18) });
    });
    sacn.on("message", (m) => {
        const len = (o) => m.readUInt16BE(o) & 0x0fff, flags = (o) => m[o] >> 4;
        if (m.readUInt16BE(0) !== 0x10 || m.readUInt16BE(2) !== 0 || m.subarray(4, 16).toString("latin1") !== "ASC-E1.17\0\0\0") return seen.problems.push("bad ACN preamble");
        if (flags(16) !== 7 || flags(38) !== 7 || flags(115) !== 7) seen.problems.push("a PDU without flags 0x7");
        if (len(16) !== m.length - 16 || len(38) !== m.length - 38 || len(115) !== m.length - 115) seen.problems.push("PDU lengths do not add up");
        if (m.readUInt32BE(18) !== 4 || m.readUInt32BE(40) !== 2 || m[117] !== 2 || m[118] !== 0xa1) seen.problems.push("wrong vectors");
        if (m.readUInt16BE(123) !== m.length - 125 || m[125] !== 0) seen.problems.push("wrong property count or start code");
        seen.sacn.push({ universe: m.readUInt16BE(113), sequence: m[111], name: m.subarray(44, 108).toString().replace(/\0.*$/, ""), priority: m[108], terminated: !!(m[112] & 0x40) });
    });
    await bindUdp(node, port);
    await bindUdp(sacn, ports[1]);
    return {
        env: { ARTNET_NODE: `127.0.0.1:${port}`, ARTNET_POLL_TO: `127.0.0.1:${port}`, SACN_HOST: `127.0.0.1:${ports[1]}`, ARTNET_LISTEN_PORT: String(ports[2]) },
        close() { setTimeout(() => { node.close(); sacn.close(); }, 50); },
        check() {
            if (seen.problems.length) return `the node saw: ${seen.problems[0]}`;
            if (seen.dmx.length === 0) return "the node got no ArtDMX";
            if (seen.polls === 0) return "the node got no ArtPoll";
            if (!seen.dmx.some((d) => d.universe === 0x13 && d.data[0] === 255 && d.data[9] === 200)) return "the scene's levels never reached the node";
            if (seen.sacn.length !== 3 || !seen.sacn[2].terminated || seen.sacn[0].name !== "Stage left" || seen.sacn[0].priority !== 150) return `sACN packets wrong: ${JSON.stringify(seen.sacn)}`;
            return null;
        },
    };
}
