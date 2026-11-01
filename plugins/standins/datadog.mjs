// Datadog for the datadog plugin's test, written from docs.datadoghq.com/api: DD-API-KEY (403
// { errors: ["Forbidden"] }), POST /api/v2/series (type 0 to 3, points of { timestamp, value } in
// whole seconds, interval for count and rate, resources; gzip allowed; 202 { errors: [] }), POST
// /api/v1/events (202 { status: "ok", event }), POST /api/v1/check_run (202 { status: "ok" }), GET
// /api/v1/validate, and the logs intake POST /api/v2/logs (a JSON array, at most 1000 entries and
// 5 MB once unpacked, each at most 1 MB, gzip; 202 {}). A wrong series is a 400 with `errors`.
//
//   start({ port, ports }) -> { env: { DATADOG_API_URL, DATADOG_LOGS_URL, DD_API_KEY }, close(), check() }
import { createServer } from "node:http";
import { gunzipSync } from "node:zlib";

const KEY = "qktestdatadog000000000000000000a";

export async function start({ port }) {
    const stats = { series: 0, events: 0, checks: 0, logs: 0, logBatches: 0, biggestBatch: 0, biggestBytes: 0, gz: 0, flaky: 0, tags: [], types: [], hostSeen: 0 };
    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", () => {
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            if (req.url === "/api/v1/validate") return req.headers["dd-api-key"] === KEY ? send(200, { valid: true }) : send(403, { errors: ["Forbidden"] });
            if (req.headers["dd-api-key"] !== KEY) return send(403, { errors: ["Forbidden"] });
            let raw = Buffer.concat(chunks);
            if (req.headers["content-encoding"] === "gzip") { raw = gunzipSync(raw); stats.gz++; }
            const b = JSON.parse(raw.toString());
            if (req.url === "/api/v2/series") {
                for (const s of b.series ?? []) {
                    if (s.metric === "refused.metric") return send(400, { errors: ["Invalid metric name"] });
                    if (s.metric === "flaky.metric" && !stats.flaky++) return send(503, { errors: ["Service Unavailable"] });
                    if (![0, 1, 2, 3].includes(s.type)) return send(400, { errors: ["Invalid type"] });
                    if (!s.points?.every((p) => Number.isInteger(p.timestamp) && typeof p.value === "number")) return send(400, { errors: ["Invalid points"] });
                    if ((s.type === 1 || s.type === 2) && !s.interval) return send(400, { errors: ["interval is required for count and rate"] });
                    stats.series++; stats.tags.push(...(s.tags ?? [])); stats.types.push(s.type);
                    if (s.resources?.[0]?.type === "host") stats.hostSeen++;
                }
                return send(202, { errors: [] });
            }
            if (req.url === "/api/v1/events") { if (!b.title || !b.text) return send(400, { errors: ["title and text are required"] }); stats.events++; return send(202, { status: "ok", event: { id: 1234567, url: "https://app.datadoghq.com/event/1234567", title: b.title } }); }
            if (req.url === "/api/v1/check_run") { if (!b.check || !b.host_name || ![0, 1, 2, 3].includes(b.status)) return send(400, { errors: ["Invalid check"] }); stats.checks++; return send(202, { status: "ok" }); }
            if (req.url === "/api/v2/logs") {
                if (!Array.isArray(b)) return send(400, { errors: ["a JSON array is expected"] });
                if (b.length > 1000) return send(413, { errors: ["too many entries"] });
                if (raw.length > 5e6) return send(413, { errors: ["payload too big"] });
                for (const l of b) if (JSON.stringify(l).length > 1e6) return send(400, { errors: ["a log is over 1 MB"] });
                stats.logs += b.length; stats.logBatches++;
                stats.biggestBatch = Math.max(stats.biggestBatch, b.length); stats.biggestBytes = Math.max(stats.biggestBytes, raw.length);
                return send(202, {});
            }
            send(404, { errors: ["Not Found"] });
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    const base = `http://127.0.0.1:${port}`;
    return {
        env: { DATADOG_API_URL: base, DATADOG_LOGS_URL: base, DD_API_KEY: KEY },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.series || !stats.events || !stats.checks || !stats.logs) return `the Datadog stand-in was not reached by everything: ${JSON.stringify(stats)}`;
            if (stats.biggestBatch !== 1000) return `the biggest batch of logs was ${stats.biggestBatch}`;
            if (!stats.tags.includes("env:prod_eu")) return `tags came as ${stats.tags}`;
            if (!stats.gz) return "nothing was gzipped";
            if (!stats.hostSeen) return "no host reached the stand-in";
            if (stats.flaky < 2) return "the plugin did not retry the 503";
            return null;
        },
    };
}
