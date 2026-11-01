// PagerDuty for the pagerduty plugin's test, written from developer.pagerduty.com. Events API v2:
// POST /v2/enqueue (routing_key of 32 characters, event_action, a dedup_key required but for trigger,
// payload.summary, source and severity required on trigger), 202 { status: "success", message:
// "Event processed", dedup_key }, 400 { status: "invalid event", message, errors }, 429; POST
// /v2/change/enqueue. REST API: `Authorization: Token token=...`, the versioned Accept header,
// /incidents with limit, offset, more and statuses[], GET and PUT /incidents/:id (a From header
// required), POST /incidents/:id/notes; errors as { error: { message, code, errors } }.
//
//   start({ port }) -> { env: { PAGERDUTY_EVENTS_URL, PAGERDUTY_API_URL, PAGERDUTY_ROUTING_KEY, PAGERDUTY_API_TOKEN, PAGERDUTY_FROM }, close(), check() }
import { createServer } from "node:http";

const ROUTING = "b1a2c3d4e5f60718293a4b5c6d7e8f90", TOKEN = "qktestpagerduty";

export async function start({ port }) {
    const stats = { triggers: 0, acks: 0, resolves: 0, changes: 0, flaky: 0, pages: 0, updates: 0, notes: 0, links: 0, actions: [] };
    const incidents = Array.from({ length: 230 }, (_, i) => ({ id: `PT${i}`, incident_number: i + 1, title: `Alert ${i}`, status: i % 2 ? "acknowledged" : "triggered" }));
    let n = 0;
    const open = new Set();
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            const url = new URL(req.url, "http://x");
            const p = url.pathname;
            if (p === "/v2/enqueue" || p === "/v2/change/enqueue") {
                const b = JSON.parse(body);
                const bad = (errors) => send(400, { status: "invalid event", message: "Event object is invalid", errors });
                if (b.routing_key?.length !== 32) return bad(["'routing_key' is invalid"]);
                if (b.routing_key !== ROUTING) return bad(["'routing_key' is invalid: no such integration"]);
                if (p.includes("change")) { if (!b.payload?.summary || !b.payload?.source) return bad(["'payload.summary' is required"]); stats.changes++; return send(202, { status: "success", message: "Change event processed" }); }
                if (!["trigger", "acknowledge", "resolve"].includes(b.event_action)) return bad(["'event_action' is invalid"]);
                if (b.event_action !== "trigger" && !b.dedup_key) return bad(["'dedup_key' is required"]);
                if ((b.dedup_key ?? "").length > 255) return bad(["'dedup_key' must be at most 255 characters"]);
                if (b.event_action === "trigger") {
                    const q = b.payload ?? {};
                    if (!q.summary || !q.source || !["critical", "error", "warning", "info"].includes(q.severity)) return bad(["'payload' is missing a required field"]);
                    if (q.summary === "flaky network" && !stats.flaky++) return send(429, { status: "throttle event", message: "Requests for this service are arriving too quickly" });
                    stats.triggers++;
                    if (b.links?.[0]?.href) stats.links++;
                    const key = b.dedup_key ?? `srv01HN${++n}`;
                    open.add(key);
                    return send(202, { status: "success", message: "Event processed", dedup_key: key });
                }
                if (!open.has(b.dedup_key)) return bad(["no open incident has that dedup_key"]);
                stats[b.event_action === "resolve" ? "resolves" : "acks"]++;
                stats.actions.push(b.event_action);
                if (b.event_action === "resolve") open.delete(b.dedup_key);
                return send(202, { status: "success", message: "Event processed", dedup_key: b.dedup_key });
            }
            const fail = (code, message, ecode, errors) => send(code, { error: { message, code: ecode, ...(errors ? { errors } : {}) } });
            if (req.headers.authorization !== `Token token=${TOKEN}`) return fail(401, "Authentication failed", 2006);
            if (req.headers.accept !== "application/vnd.pagerduty+json;version=2") return fail(406, "Not Acceptable", 2000);
            if (p === "/incidents") {
                const limit = Number(url.searchParams.get("limit") ?? 25), offset = Number(url.searchParams.get("offset") ?? 0);
                if (limit > 100) return fail(400, "Invalid Input Provided", 2001, ["limit must be at most 100"]);
                const st = url.searchParams.getAll("statuses[]");
                const all = incidents.filter((i) => !st.length || st.includes(i.status));
                if (offset) stats.pages++;
                return send(200, { incidents: all.slice(offset, offset + limit), limit, offset, more: offset + limit < all.length, total: null });
            }
            let m;
            if (m = /^\/incidents\/([^/]+)(\/notes)?$/.exec(p)) {
                const inc = incidents.find((i) => i.id === m[1]);
                const needFrom = req.method !== "GET";
                if (needFrom && !req.headers.from) return fail(400, "Invalid Input Provided", 2001, ["A valid user making the request must be provided in the From header."]);
                if (!inc && m[1] !== "PT4KHLK") return fail(404, "Incident Not Found", 5001);
                if (m[2]) { stats.notes++; return send(201, { note: { id: "N1", content: JSON.parse(body).note.content } }); }
                if (req.method === "PUT") { const b = JSON.parse(body); if (b.incident?.type !== "incident_reference") return fail(400, "Invalid Input Provided", 2001); inc.status = b.incident.status; stats.updates++; }
                return send(200, { incident: inc });
            }
            fail(404, "Not Found", 2100);
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    const base = `http://127.0.0.1:${port}`;
    return {
        env: { PAGERDUTY_EVENTS_URL: base, PAGERDUTY_API_URL: base, PAGERDUTY_ROUTING_KEY: ROUTING, PAGERDUTY_API_TOKEN: TOKEN, PAGERDUTY_FROM: "oncall@example.com" },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.triggers || !stats.changes || !stats.pages || !stats.updates || !stats.notes || !stats.links) return `the PagerDuty stand-in was not reached by everything: ${JSON.stringify(stats)}`;
            if (stats.actions.join() !== "acknowledge,resolve") return `the actions came as ${stats.actions}`;
            if (stats.flaky < 2) return "the plugin did not retry the 429";
            return null;
        },
    };
}
