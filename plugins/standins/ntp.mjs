// NTP servers for the ntp plugin's test, on node:dgram, answering client requests (mode 3)
// in server mode (4) as RFC 5905 says: the version echoed, the request's transmit timestamp
// as the origin, receive and transmit timestamps from the server's clock.
//
//   port      stratum 2, its clock 3 s ahead of this machine's, reference 192.168.1.1
//   port + 1  a Kiss-o'-Death: stratum 0, code RATE
//   port + 2  stratum 1 (GPS), its clock 0.8 s behind, its answers 250 ms on the way
//   port + 3  unsynchronized: leap 3, stratum 16
//   port + 4  given to the example as NTP_LISTEN_PORT, for its own time server
import { createSocket } from "node:dgram";

const EPOCH = 2208988800n;
function ntpTime(ms) {
    const ns = BigInt(Math.round(ms * 1e6));
    const secs = ns / 1000000000n + EPOCH, frac = ((ns % 1000000000n) << 32n) / 1000000000n;
    const b = Buffer.alloc(8); b.writeUInt32BE(Number(secs & 0xffffffffn), 0); b.writeUInt32BE(Number(frac), 4);
    return b;
}
const short = (s) => { const b = Buffer.alloc(4); b.writeUInt32BE(Math.round(s * 65536)); return b; };

// Binds a UDP socket, trying again for a few seconds while the port is still held (the
// previous example may not have let go of it yet).
function bindUdp(sock, port, host = "127.0.0.1") {
    return new Promise((resolve, reject) => {
        let tries = 0;
        const attempt = () => {
            const onError = (e) => {
                sock.off("listening", onListening);
                if (e.code === "EADDRINUSE" && ++tries < 40) setTimeout(attempt, 100);
                else reject(e);
            };
            const onListening = () => { sock.off("error", onError); resolve(); };
            sock.once("error", onError);
            sock.once("listening", onListening);
            sock.bind(port, host);
        };
        attempt();
    });
}

export async function start({ port }) {
    const seen = { asked: [0, 0, 0, 0], problems: [] };
    const servers = [
        { skew: 3000, stratum: 2, ref: Buffer.from([192, 168, 1, 1]), leap: 0, delay: 0, rootDelay: 0.012, rootDisp: 0.020 },
        { kod: "RATE" },
        { skew: -800, stratum: 1, ref: Buffer.from("GPS\0"), leap: 0, delay: 250, rootDelay: 0, rootDisp: 0.001 },
        { skew: 0, stratum: 16, ref: Buffer.from("INIT"), leap: 3, delay: 0, rootDelay: 0, rootDisp: 0 },
    ];
    const socks = servers.map((cfg, i) => {
        const s = createSocket("udp4");
        s.on("message", (m, r) => {
            const received = Date.now() + (cfg.skew ?? 0);
            if (m.length < 48) { seen.problems.push("a request shorter than 48 bytes"); return; }
            const mode = m[0] & 7, vn = (m[0] >> 3) & 7;
            if (mode !== 3) { seen.problems.push(`a request in mode ${mode}, not 3 (client)`); return; }
            if (m.readBigUInt64BE(40) === 0n) { seen.problems.push("a request with no transmit timestamp"); return; }
            seen.asked[i]++;
            const out = Buffer.alloc(48);
            if (cfg.kod) {
                out[0] = (3 << 6) | (vn << 3) | 4; out[1] = 0; out.write(cfg.kod, 12, "ascii");
                m.copy(out, 24, 40, 48);
                s.send(out, r.port, r.address);
                return;
            }
            const answer = () => {
                out[0] = (cfg.leap << 6) | (vn << 3) | 4; out[1] = cfg.stratum; out[2] = m[2]; out[3] = 0xec;
                short(cfg.rootDelay).copy(out, 4); short(cfg.rootDisp).copy(out, 8); cfg.ref.copy(out, 12);
                ntpTime(received - 64000).copy(out, 16);
                m.copy(out, 24, 40, 48);
                ntpTime(received).copy(out, 32);
                ntpTime(Date.now() + cfg.skew).copy(out, 40);
                // a slow path back: the answer waits on its way, which NTP counts as delay
                if (cfg.delay) setTimeout(() => s.send(out, r.port, r.address), cfg.delay); else s.send(out, r.port, r.address);
            };
            answer();
        });
        return s;
    });
    await Promise.all(socks.map((s, i) => bindUdp(s, port + i)));
    return {
        env: {
            NTP_SERVER: `127.0.0.1:${port}`, NTP_SERVER_KOD: `127.0.0.1:${port + 1}`,
            NTP_SERVER_SLOW: `127.0.0.1:${port + 2}`, NTP_SERVER_UNSYNCED: `127.0.0.1:${port + 3}`, NTP_LISTEN_PORT: String(port + 4),
        },
        close: () => socks.forEach((s) => s.close()),
        check: () => {
            if (seen.problems.length) return `the NTP stand-in saw: ${[...new Set(seen.problems)].join("; ")}`;
            if (seen.asked.some((n) => n === 0)) return `the NTP servers were asked ${seen.asked.join(", ")} times`;
            return null;
        },
    };
}
