// A StatsD server for the statsd plugin's test: StatsD and DogStatsD lines over UDP (port) and
// TCP (port + 1, one line per \n), and Graphite plaintext over TCP (port + 2), each line read as
// the formats say and kept. check() says what the example should have sent and did not.
//
// StatsD (github.com/statsd/statsd docs/metric_types.md): <name>:<value>|<c|g|ms|h|s>[|@rate],
// several lines to a packet. DogStatsD (docs.datadoghq.com/developers/dogstatsd/datagram_shell):
// |#tag:v,tag2 tags, |d distributions, _e{title.length,text.length}:title|text|d:..|h:..|k:..|
// p:..|s:..|t:..|#tags events, _sc|name|status|d:..|h:..|#tags|m:message service checks.
// Graphite (graphite.readthedocs.io feeding-carbon): <path> <value> <timestamp>, and 1.1 tags as
// path;tag=value.
import { createSocket } from "node:dgram";
import { createServer } from "node:net";

const NUM = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function parseStatsd(line) {
    if (line.startsWith("_e{")) {
        const m = /^_e\{(\d+),(\d+)\}:/.exec(line);
        if (!m) return { error: "bad event header" };
        const tl = Number(m[1]), xl = Number(m[2]);
        const body = Buffer.from(line.slice(m[0].length));
        if (body.length < tl + 1 + xl || body[tl] !== 0x7c) return { error: "event lengths do not match" };
        const ev = { type: "event", title: body.subarray(0, tl).toString(), text: body.subarray(tl + 1, tl + 1 + xl).toString(), tags: [] };
        for (const part of body.subarray(tl + 1 + xl).toString().split("|").filter(Boolean)) {
            if (part.startsWith("#")) ev.tags = part.slice(1).split(",");
            else if (/^[dhkpst]:/.test(part)) ev[part[0]] = part.slice(2);
            else return { error: `unknown event field ${part}` };
        }
        if (ev.p && !["normal", "low"].includes(ev.p)) return { error: "bad priority" };
        if (ev.t && !["error", "warning", "info", "success"].includes(ev.t)) return { error: "bad alert type" };
        return ev;
    }
    if (line.startsWith("_sc|")) {
        const parts = line.split("|");
        const sc = { type: "service_check", name: parts[1], status: Number(parts[2]), tags: [] };
        if (!sc.name || !/^[0-3]$/.test(parts[2] ?? "")) return { error: "bad service check" };
        for (let i = 3; i < parts.length; i++) {
            const p = parts[i];
            if (p.startsWith("#")) sc.tags = p.slice(1).split(",");
            else if (p.startsWith("m:")) { sc.message = parts.slice(i).join("|").slice(2); break; }
            else if (/^[dh]:/.test(p)) sc[p[0]] = p.slice(2);
            else return { error: `unknown service check field ${p}` };
        }
        return sc;
    }
    const colon = line.indexOf(":");
    if (colon <= 0) return { error: "no name:value" };
    const name = line.slice(0, colon);
    const parts = line.slice(colon + 1).split("|");
    const [value, type, ...rest] = parts;
    if (!["c", "g", "ms", "h", "s", "d"].includes(type)) return { error: `unknown type ${type}` };
    if (type !== "s" && !NUM.test(value)) return { error: `value ${value} is not a number` };
    if ((value.startsWith("+") || value.startsWith("-")) && type === "c" && value.startsWith("+")) return { error: "a counter has no +" };
    const m = { type, name, value: type === "s" ? value : Number(value), rate: 1, tags: [] };
    for (const p of rest) {
        if (p.startsWith("@")) { m.rate = Number(p.slice(1)); if (!(m.rate > 0 && m.rate <= 1)) return { error: "bad rate" }; }
        else if (p.startsWith("#")) m.tags = p.slice(1).split(",");
        else if (/^T\d+$/.test(p)) m.ts = Number(p.slice(1));
        else if (p.startsWith("c:")) m.container = p.slice(2);
        else return { error: `unknown field ${p}` };
    }
    return m;
}

function parseGraphite(line) {
    const f = line.trim().split(/\s+/);
    if (f.length !== 3) return { error: "graphite lines are path value timestamp" };
    if (!NUM.test(f[1])) return { error: "graphite value is not a number" };
    if (!/^-?\d+$/.test(f[2])) return { error: "graphite timestamp is not whole seconds" };
    const [path, ...tags] = f[0].split(";");
    for (const t of tags) if (!/^[^=]+=[^=]+$/.test(t)) return { error: `bad graphite tag ${t}` };
    return { path, tags, value: Number(f[1]), ts: Number(f[2]) };
}

export async function start({ port }) {
    const udp = [], tcp = [], graphite = [], errors = [];
    let packets = 0;
    const take = (list, parse) => (line) => {
        if (!line.trim()) return;
        const m = parse(line);
        if (m.error) errors.push(`${m.error}: ${JSON.stringify(line)}`); else list.push(m);
    };
    const sock = createSocket("udp4");
    sock.on("message", (msg) => { packets++; msg.toString().split("\n").forEach(take(udp, parseStatsd)); });
    await new Promise((r) => sock.bind(port, "127.0.0.1", r));
    const lineServer = (p, onLine) => {
        const s = createServer((c) => {
            let buf = "";
            c.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { onLine(buf.slice(0, i).replace(/\r$/, "")); buf = buf.slice(i + 1); } });
            c.on("error", () => {});
        });
        return new Promise((r) => s.listen(p, "127.0.0.1", () => r(s)));
    };
    const t1 = await lineServer(port + 1, take(tcp, parseStatsd));
    const t2 = await lineServer(port + 2, take(graphite, parseGraphite));
    const has = (list, f) => list.some(f);
    return {
        env: {
            STATSD_URL: `udp://127.0.0.1:${port}`,
            STATSD_TCP_URL: `tcp://127.0.0.1:${port + 1}`,
            GRAPHITE_URL: `graphite://127.0.0.1:${port + 2}`,
            STATSD_LISTEN_PORT: String(port + 3),
            APP_ENV: "test",
        },
        close() { sock.close(); t1.close(); t2.close(); },
        async check() {
            const wants = [
                ["a tagged counter over UDP (shop.orders:1|c|#env:test,country:FR)", () => has(udp, (m) => m.name === "shop.orders" && m.type === "c" && m.value === 1 && m.tags.includes("env:test") && m.tags.includes("country:FR"))],
                ["a histogram, a set, a gauge, a gauge delta and a timer over UDP", () => ["h", "s", "g", "ms"].every((t) => has(udp, (m) => m.type === t)) && has(udp, (m) => m.name === "shop.stock.sku42" && m.value === -1)],
                ["a DogStatsD event", () => has(udp, (m) => m.type === "event" && m.title === "Deployed 1.4.2" && m.t === "success" && m.k === "deploys")],
                ["a DogStatsD service check", () => has(udp, (m) => m.type === "service_check" && m.name === "shop.db.reachable" && m.status === 0 && m.message === "replica lag 20 ms")],
                ["StatsD over TCP (shop.emails.sent:3|c)", () => has(tcp, (m) => m.name === "shop.emails.sent" && m.value === 3) && has(tcp, (m) => m.type === "ms" && m.value === 118.5)],
                ["Graphite lines (shop.queue.depth 12 ts, shop.orders;country=FR)", () => has(graphite, (m) => m.path === "shop.queue.depth" && m.value === 12) && has(graphite, (m) => m.path === "shop.orders" && m.tags.includes("country=FR"))],
                ["several metrics in one UDP packet (the buffer)", () => packets > 0 && packets < udp.length],
            ];
            for (let i = 0; i < 30 && wants.some(([, f]) => !f()); i++) await new Promise((r) => setTimeout(r, 100));
            const missing = wants.filter(([, f]) => !f()).map(([w]) => w);
            if (errors.length) return `the StatsD stand-in could not read: ${errors.join("; ")}`;
            return missing.length ? `the StatsD stand-in never got: ${missing.join("; ")}` : null;
        },
    };
}
