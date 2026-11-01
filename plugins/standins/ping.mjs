// A TCP service for ping.qwe's TCP-connect ping: it accepts and counts connections. Nothing to
// stand in for ICMP: the example pings this machine's own loopback, with the kernel answering.
import { createServer } from "node:net";

export async function start({ port }) {
    let accepted = 0;
    const server = createServer((s) => { accepted++; s.on("error", () => {}); s.end(); });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { PING_OPEN_PORT: String(port) },
        close() { server.close(); },
        check() { return accepted === 0 ? "nothing connected to the TCP port" : null; },
    };
}
