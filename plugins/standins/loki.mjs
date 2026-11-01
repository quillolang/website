// Grafana Loki's HTTP API for the loki plugin's test, written from grafana.com/docs/loki/latest/reference/loki-http-api:
// POST /loki/api/v1/push ({ streams: [{ stream, values: [[ns text, line, metadata?]] }] }, 204, out
// of order within a stream refused with 400 "entry too far behind"; timestamps must be strings of
// digits), GET /loki/api/v1/query_range (start, end exclusive, limit, direction backward by default,
// step; result streams or matrix), GET /loki/api/v1/query (a log selector refused as Loki refuses it,
// metric queries a vector), labels, label values, series, /ready, X-Scope-OrgID required as on a
// multi-tenant Loki (401 "no org id"), a 429 once for stream "limited". A parse error is a 400 in
// plain text, as Loki gives it.
//
//   start({ port }) -> { env: { LOKI_API_URL, LOKI_TENANT }, close(), check() }
import { createServer } from "node:http";

const TENANT = "shop-tenant";

export async function start({ port }) {
    const stats = { pushed: 0, ranges: 0, limited: 0, seenMetadata: 0 };
    const streams = new Map();
    let limitOnce = true;
    const keyOf = (l) => JSON.stringify(Object.keys(l).sort().map((k) => [k, l[k]]));
    const selects = (sel) => {
        const m = sel.match(/^\{(.*?)\}/);
        if (!m) throw new Error("parse error at line 1, col 1: syntax error: unexpected end of input");
        const wants = [...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], x[2]]);
        if (!wants.length) throw new Error("parse error at line 1, col 6: syntax error: unexpected $end");
        return (labels) => wants.every(([k, v]) => labels[k] === v);
    };
    function logs(q, start, end, limit, dir) {
        if (!q.startsWith("{") || q.includes("=\n") || !/\}/.test(q)) throw new Error('parse error at line 1, col 6: syntax error: unexpected $end, expecting IDENTIFIER or }');
        const hit = selects(q);
        let all = [];
        for (const s of streams.values()) if (hit(s.stream)) for (const v of s.values) { const n = BigInt(v[0]); if (n >= start && n < end) all.push([n, s, v]); }
        all.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
        if (dir === "backward") all.reverse();
        all = all.slice(0, limit);
        const out = new Map();
        for (const [, s, v] of all) { const k = keyOf(s.stream); if (!out.has(k)) out.set(k, { stream: s.stream, values: [] }); out.get(k).values.push(v); }
        return [...out.values()];
    }
    function route(m, url, raw, req) {
        const p = url.pathname, q = url.searchParams;
        if (p === "/ready") return [200, "ready\n", "text/plain"];
        if (req.headers["x-scope-orgid"] !== TENANT) return [401, "no org id\n", "text/plain"];
        if (p === "/loki/api/v1/push" && m === "POST") {
            const b = JSON.parse(raw);
            for (const s of b.streams) {
                if (s.stream.app === "limited" && limitOnce) { limitOnce = false; stats.limited++; return [429, "Maximum active stream limit exceeded\n", "text/plain"]; }
                const k = keyOf(s.stream);
                if (!streams.has(k)) streams.set(k, { stream: s.stream, values: [] });
                const t = streams.get(k);
                for (const v of s.values) {
                    if (typeof v[0] !== "string" || !/^\d+$/.test(v[0])) return [400, `entry for stream has an invalid timestamp ${v[0]}\n`, "text/plain"];
                    const last = t.values[t.values.length - 1];
                    if (last && BigInt(v[0]) < BigInt(last[0])) return [400, `entry with timestamp ${v[0]} ignored, reason: 'entry too far behind'\n`, "text/plain"];
                    if (v[2]) stats.seenMetadata++;
                    t.values.push(v); stats.pushed++;
                }
            }
            return [204, ""];
        }
        const ok = (data) => [200, JSON.stringify({ status: "success", data })];
        if (p === "/loki/api/v1/query_range") {
            stats.ranges++;
            const query = q.get("query"), start = BigInt(q.get("start")), end = BigInt(q.get("end"));
            if (query.startsWith("sum")) return ok({ resultType: "matrix", result: [{ metric: { app: "shop" }, values: [[1730000000, "0.25"], [1730000300, "NaN"]] }], stats: { summary: { totalLinesProcessed: 3 } } });
            return ok({ resultType: "streams", result: logs(query, start, end, Number(q.get("limit") ?? 100), q.get("direction") ?? "backward"), stats: { summary: { totalLinesProcessed: 3 } } });
        }
        if (p === "/loki/api/v1/query") {
            const query = q.get("query");
            if (query.startsWith("{")) return [400, "log queries are not supported as an instant query type, please change your query to a range query type\n", "text/plain"];
            return ok({ resultType: "vector", result: [{ metric: {}, value: [1730000000, "7"] }] });
        }
        if (p === "/loki/api/v1/labels") return ok([...new Set([...streams.values()].flatMap((s) => Object.keys(s.stream)))].sort());
        let x = p.match(/^\/loki\/api\/v1\/label\/(\w+)\/values$/);
        if (x) return ok([...new Set([...streams.values()].map((s) => s.stream[x[1]]).filter(Boolean))].sort());
        if (p === "/loki/api/v1/series") { const hit = selects(q.get("match[]")); return ok([...streams.values()].map((s) => s.stream).filter(hit)); }
        return [404, "404 page not found\n", "text/plain"];
    }
    const server = createServer((req, res) => {
        let raw = "";
        req.on("data", (d) => (raw += d));
        req.on("end", () => {
            let out;
            try { out = route(req.method, new URL(req.url, "http://x"), raw, req); } catch (e) { out = [400, e.message + "\n", "text/plain"]; }
            res.writeHead(out[0], { "content-type": out[2] ?? "application/json" }); res.end(out[1]);
        });
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { LOKI_API_URL: `http://127.0.0.1:${port}`, LOKI_TENANT: TENANT },
        close() { server.close(); server.closeAllConnections?.(); },
        check: () => (!stats.pushed ? "nothing was pushed" : !stats.ranges ? "nothing was queried" : !stats.limited ? "the 429 was never met" : !stats.seenMetadata ? "structured metadata never came" : null),
    };
}
