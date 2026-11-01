// Mixpanel's ingestion and Query APIs for the mixpanel plugin's test, written from
// developer.mixpanel.com's reference (Ingestion, Query) and "Import Events": POST /track?verbose=1
// with a JSON list, each properties.token and time, within 5 days; POST /import?strict=1&project_id=
// with HTTP Basic, at most 2000 events, properties.time, distinct_id and $insert_id (at most 36 of
// letters, digits, -) required, a 400 giving failed_records with index, field and message, and
// duplicates by $insert_id kept once; /engage and /groups with $token, each operation alone; under
// /api/query, /segmentation, /funnels, /retention, /insights, and POST /engage with session_id and
// page. Query errors are { request, error }, /track's verbose ones { status: 0, error }.
//
//   start({ port }) -> { env: { MIXPANEL_* }, close(), check() }
import { createServer } from "node:http";

const TOKEN = "qktestmixpaneltoken", PROJECT = "2195193", USER = "svc.standin", SECRET = "standin-secret";

export async function start({ port }) {
    const base = `http://127.0.0.1:${port}`;
    const stats = { tracked: 0, imported: 0, biggest: 0, engaged: 0, ops: new Set(), groups: 0, limited: 0, pages: 0, duplicate: 0 };
    const insertIds = new Set();
    const auth = `Basic ${Buffer.from(`${USER}:${SECRET}`).toString("base64")}`;
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            const url = new URL(req.url, "http://x");
            const p = url.pathname, q = url.searchParams;
            if (p === "/track") {
                const list = JSON.parse(body);
                if (list.length > 2000) { stats.biggest = list.length; return send(400, { status: 0, error: "too many events" }); }
                stats.biggest = Math.max(stats.biggest, list.length);
                for (const e of list) {
                    if (e.properties?.token !== TOKEN) return send(200, { status: 0, error: "token, missing or empty" });
                    if (e.event === "Refused") return send(200, { status: 0, error: "event name refused" });
                    if (e.event === "Busy" && !stats.limited) { stats.limited++; res.writeHead(429); return res.end(); }
                    if (Date.now() / 1000 - e.properties.time > 5 * 86400) return send(200, { status: 0, error: "'time' is too old" });
                }
                stats.tracked += list.length;
                return send(200, { status: 1, error: null });
            }
            if (p === "/import") {
                if (req.headers.authorization !== auth) return send(401, { code: 401, error: "Invalid credentials", status: 0 });
                if (q.get("project_id") !== PROJECT || q.get("strict") !== "1") return send(400, { code: 400, error: "project_id and strict=1 are needed", status: "Bad Request" });
                const list = JSON.parse(body);
                if (list.length > 2000) return send(413, { code: 413, error: "more than 2000 events", status: "Request Entity Too Large" });
                stats.biggest = Math.max(stats.biggest, list.length);
                const failed = [];
                let good = 0;
                list.forEach((e, index) => {
                    const pr = e.properties ?? {};
                    if (!pr.$insert_id) return failed.push({ index, $insert_id: "", field: "properties.$insert_id", message: "'properties.$insert_id' is required" });
                    if (!(pr.time > 1262304000)) return failed.push({ index, $insert_id: pr.$insert_id, field: "properties.time", message: "'properties.time' is invalid: must be specified as seconds since epoch" });
                    if (insertIds.has(pr.$insert_id)) stats.duplicate++;
                    insertIds.add(pr.$insert_id); good++;
                });
                stats.imported += good;
                if (failed.length) return send(400, { code: 400, error: "some data points in the request failed validation", failed_records: failed, num_records_imported: good, status: "Bad Request" });
                return send(200, { code: 200, num_records_imported: good, status: "OK" });
            }
            if (p === "/engage" || p === "/groups") {
                const list = JSON.parse(body);
                if (list.length > 2000) return send(400, { status: 0, error: "too many updates" });
                for (const u of list) {
                    if (u.$token !== TOKEN) return send(200, { status: 0, error: "$token, missing or empty" });
                    if (p === "/engage" && !u.$distinct_id) return send(200, { status: 0, error: "$distinct_id, missing or empty" });
                    if (p === "/groups" && (!u.$group_key || !u.$group_id)) return send(200, { status: 0, error: "group identifiers missing" });
                    const ops = Object.keys(u).filter((k) => /^\$(set|set_once|add|union|append|remove|unset|delete)$/.test(k));
                    if (ops.length !== 1) return send(200, { status: 0, error: "exactly one operation is needed" });
                    stats.ops.add(ops[0]);
                }
                if (p === "/groups") stats.groups++; else stats.engaged += list.length;
                return send(200, { status: 1, error: null });
            }
            if (p.startsWith("/api/query")) {
                const fail = (code, error) => send(code, { request: p, error });
                if (req.headers.authorization !== auth) return fail(401, "Invalid credentials");
                if (q.get("project_id") !== PROJECT) return fail(400, "project_id is required");
                const r = p.slice("/api/query".length);
                if (r === "/segmentation") return send(200, { legend_size: 1, data: { series: ["2026-10-01", "2026-10-02"], values: { [q.get("event")]: { "2026-10-01": 10, "2026-10-02": 12 } } } });
                if (r === "/funnels") return q.get("funnel_id") === "999" ? fail(400, "invalid funnel_id") : send(200, { meta: { dates: ["2026-10-01", "2026-10-02"] }, data: { "2026-10-01": { steps: [] } } });
                if (r === "/retention") return send(200, { "2026-10-01": { counts: [100, 40, 10], first: 100 } });
                if (r === "/insights") return q.get("bookmark_id") === "403" ? fail(403, "Not enough permissions") : send(200, { series: { "Signed up": { all: 42 } }, headers: ["$event"] });
                if (r === "/engage") {
                    const f = new URLSearchParams(body);
                    const pro = /pro/.test(f.get("where") ?? "");
                    const total = pro ? 3 : 2500, size = 1000;
                    const page = Number(f.get("page") ?? 0);
                    if (page) { stats.pages++; if (f.get("session_id") !== "sess-1") return fail(400, "session_id is required past page 0"); }
                    const results = Array.from({ length: Math.max(0, Math.min(size, total - page * size)) }, (_, i) => ({ $distinct_id: `user-${page * size + i}`, $properties: { plan: pro ? "pro" : "free" } }));
                    return send(200, { page, page_size: size, results, session_id: "sess-1", status: "ok", total });
                }
            }
            return send(404, { error: "not found" });
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { MIXPANEL_API_URL: base, MIXPANEL_QUERY_URL: `${base}/api`, MIXPANEL_TOKEN: TOKEN, MIXPANEL_PROJECT_ID: PROJECT, MIXPANEL_SERVICE_USER: USER, MIXPANEL_SERVICE_SECRET: SECRET },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.tracked || !stats.imported) return `the Mixpanel stand-in missed events: ${JSON.stringify({ ...stats, ops: [...stats.ops] })}`;
            if (stats.biggest > 2000) return "a batch held more than 2000";
            if (!stats.duplicate) return "a repeated import did not bring the same $insert_id";
            if (!stats.pages) return "profile pages were never followed";
            if (!stats.limited) return "the Mixpanel stand-in never saw a 429 waited out";
            for (const o of ["$set", "$set_once", "$add", "$unset", "$delete"]) if (!stats.ops.has(o)) return `the Mixpanel stand-in never saw ${o}`;
            return null;
        },
    };
}
