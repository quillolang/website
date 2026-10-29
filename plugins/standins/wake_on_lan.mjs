// A machine's network card waiting to be woken, for the wake_on_lan plugin's test: a UDP
// sink on node:dgram that checks each packet's form as AMD's Magic Packet paper says (six
// bytes of FF, then the card's MAC address sixteen times, then nothing, or a SecureOn
// password of 4 or 6 bytes) and keeps what it got. WOL_HOST and WOL_PORT point the example at it.
import { createSocket } from "node:dgram";

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
    const got = [], problems = [];
    const s = createSocket("udp4");
    s.on("message", (m) => {
        if (m.length !== 102 && m.length !== 106 && m.length !== 108) { problems.push(`a packet of ${m.length} bytes (102, 106 or 108 expected)`); return; }
        if (!m.subarray(0, 6).every((b) => b === 0xff)) { problems.push("a packet that does not start with six bytes of FF"); return; }
        const mac = m.subarray(6, 12);
        for (let k = 1; k < 16; k++) if (!m.subarray(6 + 6 * k, 12 + 6 * k).equals(mac)) { problems.push("a packet whose 16 MAC addresses differ"); return; }
        got.push({ mac: [...mac].map((b) => b.toString(16).padStart(2, "0")).join(":"), password: m.length > 102 ? m.subarray(102).toString("hex") : null });
    });
    await bindUdp(s, port);
    return {
        env: { WOL_HOST: "127.0.0.1", WOL_PORT: String(port), WOL_RELAY_PORT: String(port + 1) },
        close: () => s.close(),
        check: () => {
            if (problems.length) return `the Wake-on-LAN sink got: ${[...new Set(problems)].join("; ")}`;
            if (!got.length) return "the Wake-on-LAN sink got no magic packet";
            if (!got.some((g) => g.mac === "00:1a:2b:3c:4d:5e")) return `the sink was woken only for ${got.map((g) => g.mac).join(", ")}`;
            if (!got.some((g) => g.password === "c0ffee000001")) return "no packet carried the SecureOn password c0:ff:ee:00:00:01";
            return null;
        },
    };
}
