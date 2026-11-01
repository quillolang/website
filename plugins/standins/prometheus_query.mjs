// A Prometheus HTTP API for the prometheus_query plugin's test, written from Prometheus's "HTTP
// API" reference: GET or POST with form-encoded parameters on /api/v1/query, /query_range,
// /labels, /label/:name/values, /series, /targets, /alerts and /rules, all wrapped in { status,
// data } with errorType and error on failure (400 bad_data, as the real one gives for a PromQL
// that does not parse). A bearer token is required. A small fixed set of series is answered,
// matched by name and by label matchers with PromQL string escapes read back, so that a value
// badly quoted fails as it would on the real server.
import { createServer } from "node:http";

const TOKEN = "standin-prom-token";
const SERIES = [
    { __name__: "up", job: "api", instance: "10.0.0.1:9100" },
    { __name__: "up", job: "api", instance: "10.0.0.2:9100" },
    { __name__: "up", job: "db\"x", instance: "10.0.0.3:9100" },
];

// A selector's matchers, read the way PromQL reads them; null when it does not parse.
function parseSelector(text) {
    const m = /^([a-zA-Z_:][a-zA-Z0-9_:]*)?(\{([\s\S]*)\})?$/.exec(text.trim());
    if (!m) return null;
    const out = { name: m[1] ?? "", matchers: [] };
    let s = m[3] ?? "";
    while (s.length) {
        const h = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(=~|!~|!=|=)\s*"/.exec(s);
        if (!h) return null;
        let i = h[0].length, value = "";
        for (;;) {
            if (i >= s.length) return null;
            const c = s[i];
            if (c === '"') break;
            if (c === "\\") { const e = s[i + 1]; value += e === "n" ? "\n" : e === "t" ? "\t" : e === "r" ? "\r" : e; i += 2; continue; }
            value += c; i++;
        }
        out.matchers.push([h[1], h[2], value]);
        s = s.slice(i + 1).replace(/^\s*,?/, "");
    }
    return out;
}
function select(sel) {
    return SERIES.filter((x) => (!sel.name || x.__name__ === sel.name) && sel.matchers.every(([k, op, v]) => {
        const have = x[k] ?? "";
        if (op === "=") return have === v;
        if (op === "!=") return have !== v;
        const re = new RegExp(`^(?:${v})$`);
        return op === "=~" ? re.test(have) : !re.test(have);
    }));
}

export async function start({ port }) {
    const stats = { queries: 0, ranges: 0, authed: 0, refused: 0, hostile: 0 };
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const url = new URL(req.url, "http://x");
            const form = new URLSearchParams(body);
            const get = (k) => form.get(k) ?? url.searchParams.get(k);
            const all = (k) => [...form.getAll(k), ...url.searchParams.getAll(k)];
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            const ok = (data, extra = {}) => send(200, { status: "success", data, ...extra });
            const bad = (error, code = 400, errorType = "bad_data") => { stats.refused++; send(code, { status: "error", errorType, error }); };
            if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401, { "content-type": "text/plain" }); return res.end("Unauthorized\n"); }
            stats.authed++;
            const p = url.pathname;
            if (p === "/api/v1/query") {
                stats.queries++;
                const q = get("query");
                if (!q) return bad("invalid parameter \"query\": 1:1: parse error: no expression found in input");
                const t = 1793527200;
                if (q === "sum by (job) (rate(http_requests_total[5m]))")
                    return ok({ resultType: "vector", result: [
                        { metric: { job: "api" }, value: [t, "12.5"] },
                        { metric: { job: "web" }, value: [t, "NaN"] },
                    ] }, { warnings: ["PromQL info: metric might not be a counter"] });
                if (q === "count(up)") return ok({ resultType: "vector", result: [{ metric: {}, value: [t, "3"] }] });
                if (/\[5m$/.test(q)) return bad('invalid parameter "query": 1:37: parse error: unclosed left bracket');
                const sel = parseSelector(q);
                if (!sel) return bad(`invalid parameter "query": 1:1: parse error: unexpected character inside braces: ${q}`);
                return ok({ resultType: "vector", result: select(sel).map((s) => ({ metric: s, value: [t, "1"] })) });
            }
            if (p === "/api/v1/query_range") {
                stats.ranges++;
                for (const k of ["query", "start", "end", "step"]) if (!get(k)) return bad(`invalid parameter "${k}"`);
                const s = Date.parse(get("start")) / 1000, e = Date.parse(get("end")) / 1000, st = get("step") === "1m" ? 60 : Number(get("step"));
                if (e < s) return bad('invalid parameter "end": end timestamp must not be before start time');
                const values = []; for (let t = s; t <= e; t += st) values.push([t, String((t - s) / st + 0.5)]);
                return ok({ resultType: "matrix", result: [
                    { metric: { __name__: "x", job: "api", code: "200" }, values },
                    { metric: { job: "api", code: "500" }, values: [[s, "+Inf"]] },
                ] });
            }
            if (p === "/api/v1/labels") return ok(["__name__", "instance", "job"]);
            let m;
            if ((m = /^\/api\/v1\/label\/([^/]+)\/values$/.exec(p))) return ok([...new Set(SERIES.map((s) => s[m[1]]).filter(Boolean))].sort());
            if (p === "/api/v1/series") {
                const sels = all("match[]");
                if (!sels.length) return bad("no match[] parameter provided");
                const out = [];
                for (const t of sels) {
                    const sel = parseSelector(t);
                    if (!sel) return bad(`invalid parameter "match[]": parse error: ${t}`);
                    if (sel.matchers.some(([, , v]) => v.includes('"'))) stats.hostile++;
                    out.push(...select(sel));
                }
                return ok(out);
            }
            if (p === "/api/v1/targets") return ok({
                activeTargets: [
                    { discoveredLabels: {}, labels: { job: "api", instance: "10.0.0.1:9100" }, scrapePool: "api", scrapeUrl: "http://10.0.0.1:9100/metrics", globalUrl: "", lastError: "", lastScrape: "2026-11-01T10:00:00Z", lastScrapeDuration: 0.01, health: "up" },
                    { discoveredLabels: {}, labels: { job: "api", instance: "10.0.0.2:9100" }, scrapePool: "api", scrapeUrl: "http://10.0.0.2:9100/metrics", globalUrl: "", lastError: "connection refused", lastScrape: "2026-11-01T10:00:02Z", lastScrapeDuration: 0.0, health: "down" },
                ],
                droppedTargets: [{ discoveredLabels: { __address__: "10.0.0.9:9100" } }],
            });
            if (p === "/api/v1/alerts") return ok({ alerts: [
                { labels: { alertname: "HighErrors", severity: "page" }, annotations: { summary: "5xx over 5%" }, state: "firing", activeAt: "2026-11-01T09:00:00Z", value: "6.1e+00" },
                { labels: { alertname: "DiskFilling" }, annotations: {}, state: "pending", activeAt: "2026-11-01T09:50:00Z", value: "9e-01" },
            ] });
            if (p === "/api/v1/rules") return ok({ groups: [{ name: "api", file: "api.yml", interval: 60, rules: [
                { name: "HighErrors", type: "alerting", query: "rate(errors[5m]) > 5", state: "firing", health: "ok", lastError: "" },
                { name: "job:rate", type: "recording", query: "sum(rate(x[5m]))", health: "ok" },
            ].filter((r) => !get("type") || r.type.startsWith(get("type").slice(0, 5))) }] });
            send(404, { status: "error", errorType: "not_found", error: "not found" });
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { PROMETHEUS_API_URL: `http://127.0.0.1:${port}`, PROMETHEUS_TOKEN: TOKEN },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.authed) return "the Prometheus stand-in got no request with the token";
            if (!stats.queries || !stats.ranges) return "the Prometheus stand-in got no instant or no range query";
            return null;
        },
    };
}
