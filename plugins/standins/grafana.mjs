// Grafana's HTTP API for the grafana plugin's test, written from grafana.com/docs/grafana/latest/developers/http_api:
// Bearer service-account tokens (401 { message: "Invalid API key" }), /api/health, /api/dashboards/db
// (412 { status: "version-mismatch", message } for a stale version without overwrite),
// /api/dashboards/uid/:uid, /api/search (limit, page, query, type, tag), /api/folders,
// /api/annotations (region with timeEnd, tags all-of), /api/datasources, /api/ds/query (frames in
// schema.fields + data.values columns, an error in results.A.error with a 400 and an unknown data
// source a 404), /api/v1/provisioning/alert-rules (POST 201, X-Disable-Provenance sets
// provenance empty), /api/serviceaccounts (search, tokens with key glsa_...).
//
//   start({ port }) -> { env: { GRAFANA_API_URL, GRAFANA_TOKEN }, close(), check() }
import { createServer } from "node:http";

const TOKEN = "qk-test-grafana";

export async function start({ port }) {
    const stats = { searches: 0, queries: 0, dashboards: 0, rules: 0, tokens: 0 };
    const dashboards = new Map(), folders = new Map(), annotations = new Map(), rules = new Map(), accounts = new Map();
    let id = 40;
    for (let i = 0; i < 3; i++) dashboards.set(`seed-${i}`, { dashboard: { uid: `seed-${i}`, title: `Seed ${i}`, version: 1 }, folderUid: "" });
    const no = (s, message, status) => [s, { message, ...(status ? { status } : {}) }];
    const frame = (name, labels, times, values) => ({ schema: { name, refId: "A", fields: [{ name: "Time", type: "time" }, { name: "Value", type: "number", labels }] }, data: { values: [times, values] } });
    function route(m, url, b, req) {
        const p = url.pathname, q = url.searchParams;
        if (p === "/api/health") return [200, { commit: "abc1234", database: "ok", version: "11.3.0" }];
        if (p === "/api/dashboards/db" && m === "POST") {
            stats.dashboards++;
            const d = b.dashboard, old = dashboards.get(d.uid);
            if (old && !b.overwrite && d.version !== old.dashboard.version) return no(412, "The dashboard has been changed by someone else", "version-mismatch");
            const version = (old?.dashboard.version ?? 0) + 1, uid = d.uid ?? `gen${++id}`;
            dashboards.set(uid, { dashboard: { ...d, uid, version }, folderUid: b.folderUid ?? old?.folderUid ?? "" });
            return [200, { id: ++id, uid, url: `/d/${uid}/x`, status: "success", version, slug: "x" }];
        }
        let x = p.match(/^\/api\/dashboards\/uid\/(.+)$/);
        if (x) {
            const d = dashboards.get(x[1]);
            if (!d) return no(404, "Dashboard not found");
            if (m === "GET") return [200, { dashboard: d.dashboard, meta: { folderUid: d.folderUid, slug: "x", canSave: true } }];
            if (m === "DELETE") { dashboards.delete(x[1]); return [200, { title: d.dashboard.title, message: "Dashboard deleted", id: 1 }]; }
        }
        if (p === "/api/search") {
            stats.searches++;
            const text = (q.get("query") ?? "").toLowerCase(), limit = Number(q.get("limit") ?? 1000), page = Number(q.get("page") ?? 1);
            const hits = [...dashboards.values()].filter((d) => d.dashboard.title.toLowerCase().includes(text)).map((d) => ({ uid: d.dashboard.uid, title: d.dashboard.title, type: "dash-db", folderUid: d.folderUid }));
            return [200, hits.slice((page - 1) * limit, page * limit)];
        }
        if (p === "/api/folders" && m === "GET") return [200, [...folders.values()]];
        if (p === "/api/folders" && m === "POST") {
            if (folders.has(b.uid)) return no(409, "a folder with that name already exists");
            const f = { id: ++id, uid: b.uid ?? `f${id}`, title: b.title, url: `/dashboards/f/${b.uid}`, version: 1 };
            folders.set(f.uid, f); return [200, f];
        }
        if (p === "/api/annotations" && m === "POST") {
            if (!b.text) return no(400, "text is required");
            const a = { id: ++id, text: b.text, tags: b.tags ?? [], time: b.time, timeEnd: b.timeEnd ?? b.time, dashboardUID: b.dashboardUID, panelId: b.panelId };
            annotations.set(a.id, a); return [200, { id: a.id, message: "Annotation added" }];
        }
        if (p === "/api/annotations" && m === "GET") {
            const tags = q.getAll("tags"), from = Number(q.get("from") ?? 0), to = Number(q.get("to") ?? Infinity);
            return [200, [...annotations.values()].filter((a) => tags.every((t) => a.tags.includes(t)) && a.timeEnd >= from && a.time <= to)];
        }
        x = p.match(/^\/api\/annotations\/(\d+)$/);
        if (x && m === "DELETE") { if (!annotations.delete(Number(x[1]))) return no(404, "Annotation not found"); return [200, { message: "Annotation deleted" }]; }
        if (p === "/api/datasources") return [200, [{ id: 1, uid: "loki-1", name: "Logs", type: "loki" }, { id: 2, uid: "prom-1", name: "Metrics", type: "prometheus", url: "http://prometheus:9090", isDefault: true }]];
        if (p === "/api/ds/query" && m === "POST") {
            stats.queries++;
            const results = {};
            for (const c of b.queries) {
                if (c.datasource?.uid !== "prom-1") return no(404, "Data source not found");
                if (!c.refId || !b.from || !b.to) return no(400, "from, to and refId are required");
                if (c.expr.endsWith("(")) { return [400, { results: { [c.refId]: { error: 'bad_data: invalid parameter "query": parse error: unexpected end of input', status: 400, frames: [] } } }]; }
                results[c.refId] = { status: 200, frames: [frame("up", { job: "api", instance: "a:9090" }, [1730000000000, 1730000015000], [1, 0]), ...(c.refId === "A" ? [frame("up", { job: "api", instance: "b:9090" }, [1730000000000], [1])] : [])] };
            }
            return [200, { results }];
        }
        if (p === "/api/v1/provisioning/alert-rules" && m === "GET") return [200, [...rules.values()]];
        if (p === "/api/v1/provisioning/alert-rules" && m === "POST") {
            if (!b.noDataState || !b.execErrState || !b.for) return no(400, "invalid alert rule: noDataState, execErrState and for are required");
            stats.rules++;
            const r = { ...b, uid: `rule${++id}`, id, provenance: req.headers["x-disable-provenance"] ? "" : "api" };
            rules.set(r.uid, r); return [201, r];
        }
        x = p.match(/^\/api\/v1\/provisioning\/alert-rules\/(.+)$/);
        if (x) {
            const r = rules.get(x[1]);
            if (!r) return no(404, "rule not found");
            if (m === "GET") return [200, r];
            if (m === "PUT") { Object.assign(r, b); return [200, r]; }
            if (m === "DELETE") { rules.delete(x[1]); return [204, null]; }
        }
        if (p === "/api/serviceaccounts" && m === "POST") { const a = { id: ++id, name: b.name, login: `sa-${b.name}`, role: b.role, isDisabled: false, tokens: [] }; accounts.set(a.id, a); const { tokens, ...v } = a; return [201, v]; }
        if (p === "/api/serviceaccounts/search") {
            const text = q.get("query") ?? "", list = [...accounts.values()].filter((a) => a.name.includes(text)).map(({ tokens, ...v }) => v);
            return [200, { totalCount: list.length, serviceAccounts: list, page: 1, perPage: 100 }];
        }
        x = p.match(/^\/api\/serviceaccounts\/(\d+)(?:\/tokens(?:\/(\d+))?)?$/);
        if (x) {
            const a = accounts.get(Number(x[1]));
            if (!a) return no(404, "service account not found");
            if (p.endsWith("/tokens") && m === "POST") { stats.tokens++; const t = { id: ++id, name: b.name, expiration: b.secondsToLive ? "2026-11-01T10:00:00Z" : null }; a.tokens.push(t); return [200, { id: t.id, name: t.name, key: `glsa_testtesttest_${t.id}` }]; }
            if (p.endsWith("/tokens")) return [200, a.tokens];
            if (x[2] && m === "DELETE") { a.tokens = a.tokens.filter((t) => t.id !== Number(x[2])); return [200, { message: "API key deleted" }]; }
            if (m === "DELETE") { accounts.delete(a.id); return [200, { message: "Service account deleted" }]; }
        }
        return no(404, "Not found");
    }
    const server = createServer((req, res) => {
        let raw = "";
        req.on("data", (d) => (raw += d));
        req.on("end", () => {
            const send = (s, v) => { res.writeHead(s, { "content-type": "application/json" }); res.end(v == null ? "" : JSON.stringify(v)); };
            if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, { message: "Invalid API key" });
            try { const [s, v] = route(req.method, new URL(req.url, "http://x"), raw ? JSON.parse(raw) : {}, req); send(s, v); }
            catch (e) { send(500, { message: String(e) }); }
        });
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { GRAFANA_API_URL: `http://127.0.0.1:${port}`, GRAFANA_TOKEN: TOKEN },
        close() { server.close(); server.closeAllConnections?.(); },
        check: () => (!stats.dashboards ? "no dashboard was saved" : !stats.queries ? "no query ran" : !stats.rules ? "no alert rule came" : !stats.tokens ? "no token was made" : stats.searches < 3 ? "search was not paged" : null),
    };
}
