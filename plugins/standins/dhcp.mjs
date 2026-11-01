// A DHCP server on a high port for dhcp.qwe, on node:dgram. Written from RFC 2131 and RFC 2132:
// BOOTP's 236 bytes, the magic cookie, options as code, length, value. It answers a DISCOVER with
// an OFFER and a REQUEST for that offer with an ACK, the xid and chaddr kept, and sends a NAK to
// the MAC ending 66. Replies go back to the sender, as a server answers a relay.
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
const ip = (s) => s.split(".").map(Number);
const opt = (c, bytes) => [c, bytes.length, ...bytes];
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32BE(v); return [...b]; };

export async function start({ ports }) {
    const seen = { discovers: 0, requests: 0, releases: 0, problems: [], hostname: null, askedFor: null };
    const sock = createSocket("udp4");
    const reply = (m, from, type, yi, extra) => {
        const b = Buffer.alloc(240);
        b[0] = 2; b[1] = 1; b[2] = 6;
        m.copy(b, 4, 4, 8); // xid
        m.copy(b, 10, 10, 12); // flags
        ip(yi).forEach((x, i) => { b[16 + i] = x; });
        m.copy(b, 24, 24, 44); // giaddr, chaddr
        Buffer.from([0x63, 0x82, 0x53, 0x63]).copy(b, 236);
        const o = [...opt(53, [type]), ...opt(54, ip("192.168.50.1")), ...extra, 255];
        sock.send(Buffer.concat([b, Buffer.from(o)]), from.port, from.address);
    };
    sock.on("message", (m, from) => {
        if (m[0] !== 1 || m[1] !== 1 || m[2] !== 6 || m.length < 300) return seen.problems.push(`a malformed request: op ${m[0]}, ${m.length} bytes`);
        if (m.readUInt32BE(236) !== 0x63825363) return seen.problems.push("no magic cookie");
        const opts = new Map(); let i = 240;
        while (i < m.length && m[i] !== 255) { if (m[i] === 0) { i++; continue; } opts.set(m[i], m.subarray(i + 2, i + 2 + m[i + 1])); i += 2 + m[i + 1]; }
        const type = opts.get(53)?.[0];
        const mac = m.subarray(28, 34).toString("hex");
        const lease = [...opt(1, ip("255.255.255.0")), ...opt(3, ip("192.168.50.1")), ...opt(6, [...ip("1.1.1.1"), ...ip("9.9.9.9")]), ...opt(15, [...Buffer.from("lan.example")]), ...opt(51, u32(3600)), ...opt(58, u32(1800))];
        if (type === 1) {
            seen.discovers++; seen.hostname = opts.get(12)?.toString(); seen.askedFor = opts.get(55);
            if (m[10] !== 0x80) seen.problems.push("a discover without the broadcast flag");
            reply(m, from, 2, "192.168.50.120", lease);
        } else if (type === 3) {
            seen.requests++;
            const asked = opts.get(50), server = opts.get(54);
            if (!asked || [...asked].join(".") !== "192.168.50.120") return seen.problems.push("a request without option 50");
            if (!server || [...server].join(".") !== "192.168.50.1") return seen.problems.push("a request without option 54");
            if (mac.endsWith("66")) return reply(m, from, 6, "0.0.0.0", opt(56, [...Buffer.from("address already taken")]));
            const search = [7, ...Buffer.from("example"), 3, ...Buffer.from("com"), 0, 4, ...Buffer.from("corp"), 0xc0, 0];
            const routes = [8, 10, 192, 168, 50, 254, 0, 192, 168, 50, 1];
            reply(m, from, 5, "192.168.50.120", [...lease, ...opt(119, search), ...opt(121, routes)]);
        } else if (type === 7) {
            seen.releases++;
            if ([...m.subarray(12, 16)].join(".") !== "192.168.50.120") seen.problems.push("a release without ciaddr");
        }
    });
    await bindUdp(sock, ports[0]);
    return {
        env: { DHCP_SERVER: `127.0.0.1:${ports[0]}`, DHCP_CLIENT_PORT: String(ports[1]), DHCP_LISTEN_PORT: String(ports[2]) },
        close() { setTimeout(() => sock.close(), 50); },
        async check() {
            await new Promise((r) => setTimeout(r, 100));
            if (seen.problems.length) return seen.problems[0];
            if (seen.hostname !== "station-7") return "the hostname never reached the server";
            if (seen.requests === 0 || seen.releases === 0) return "no request or no release reached the server";
            return null;
        },
    };
}
