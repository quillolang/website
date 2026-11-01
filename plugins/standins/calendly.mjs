// A Calendly API (v2) for the calendly plugin's test, written from developer.calendly.com's
// reference: Bearer token, GET /users/me, /event_types and /scheduled_events needing a `user` or
// `organization` URI, count at most 100, pagination { count, next_page, next_page_token,
// previous_page_token }, /scheduled_events/:uuid/invitees, POST .../cancellation (a second one is a
// 403), /webhook_subscriptions (url must be https, events, organization, scope, and user for the
// user scope). Errors are { title, message, details: [{ parameter, message }] }.
//
//   start({ port }) -> { env: { CALENDLY_API_URL, CALENDLY_TOKEN }, close(), check() }
import { createServer } from "node:http";

const TOKEN = "qk-test-calendly";

export async function start({ port }) {
    const base = `http://127.0.0.1:${port}`, api = "https://api.calendly.com";
    const stats = { nexts: 0, tooMany: 0, noOwner: 0, limited: 0, cancels: 0 };
    const USER = `${api}/users/AAAAAAAAAAAAAAAA`, ORG = `${api}/organizations/BBBBBBBBBBBBBBBB`;
    const types = [], events = new Map(), hooks = new Map();
    let n = 1;
    for (let i = 0; i < 135; i++) types.push({ uri: `${api}/event_types/T${i}`, name: `Type ${i}`, active: true, duration: 30 });
    for (let i = 0; i < 215; i++) { const u = `EV${++n}`; events.set(u, { uri: `${api}/scheduled_events/${u}`, name: `Call ${i}`, status: "active", start_time: "2026-11-20T10:00:00.000000Z" }); }
    const invitees = [];
    for (let i = 0; i < 112; i++) invitees.push({ uri: `x/${i}`, name: `Invitee ${i}`, email: `invitee${i}@example.com`, status: "active" });
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(v === undefined ? "" : JSON.stringify(v)); };
            const fail = (code, title, message, details, headers = {}) => { res.writeHead(code, { "content-type": "application/json", ...headers }); res.end(JSON.stringify({ title, message, ...(details ? { details } : {}) })); };
            if (req.headers.authorization !== `Bearer ${TOKEN}`) return fail(401, "Unauthenticated", "The access token is invalid");
            const url = new URL(req.url, "http://x");
            const p = url.pathname, q = url.searchParams;
            const b = body ? JSON.parse(body) : {};
            const list = (all) => {
                const count = Number(q.get("count") ?? 20);
                if (count > 100) { stats.tooMany++; return fail(400, "Invalid Argument", "The supplied parameters are invalid.", [{ parameter: "count", message: "must be less than or equal to 100" }]); }
                const t = q.get("page_token"), at = t ? Number(Buffer.from(t, "base64url").toString()) : 0;
                if (t) stats.nexts++;
                const next = at + count < all.length ? Buffer.from(String(at + count)).toString("base64url") : null;
                send(200, { collection: all.slice(at, at + count), pagination: { count, next_page: next ? `${api}${p}?page_token=${next}` : null, previous_page: null, next_page_token: next, previous_page_token: null } });
            };
            const needOwner = () => { if (!q.get("user") && !q.get("organization")) { stats.noOwner++; fail(400, "Invalid Argument", "The supplied parameters are invalid.", [{ parameter: "user", message: "one of user or organization is required" }]); return false; } return true; };
            let m;
            if (p === "/users/me") return send(200, { resource: { uri: USER, name: "Ada Lovelace", email: "ada@example.com", current_organization: ORG } });
            if (p === "/event_types") { if (needOwner()) list(types.filter((t) => !q.has("active") || t.active === (q.get("active") === "true"))); return; }
            if (p === "/scheduled_events") {
                if (!needOwner()) return;
                const min = q.get("min_start_time");
                if (min && Number.isNaN(Date.parse(min))) return fail(400, "Invalid Argument", "The supplied parameters are invalid.", [{ parameter: "min_start_time", message: "must be a valid ISO 8601 date" }]);
                return list([...events.values()].filter((e) => !q.get("status") || e.status === q.get("status")));
            }
            if (m = /^\/scheduled_events\/([^/]+)\/invitees$/.exec(p)) return events.has(m[1]) ? list(invitees.filter((i) => !q.get("email") || i.email === q.get("email"))) : fail(404, "Resource Not Found", "The server could not find the requested resource.");
            if (m = /^\/scheduled_events\/([^/]+)\/cancellation$/.exec(p)) {
                const e = events.get(m[1]);
                if (!e) return fail(404, "Resource Not Found", "The server could not find the requested resource.");
                if (e.status === "canceled") return fail(403, "Permission Denied", "Event is already canceled");
                e.status = "canceled"; stats.cancels++;
                return send(201, { resource: { canceled_by: "Ada Lovelace", reason: b.reason, canceler_type: "host" } });
            }
            if (m = /^\/scheduled_events\/([^/]+)$/.exec(p)) {
                if (m[1] === "busy") { if (!stats.limited) { stats.limited++; return fail(429, "Too Many Requests", "You have exceeded the rate limit", null, { "retry-after": "1" }); } return send(200, { resource: { name: "After the wait" } }); }
                return events.has(m[1]) ? send(200, { resource: events.get(m[1]) }) : fail(404, "Resource Not Found", "The server could not find the requested resource.");
            }
            if (p === "/webhook_subscriptions" && req.method === "POST") {
                const details = [];
                if (!/^https:\/\//.test(b.url ?? "")) details.push({ parameter: "url", message: "must be a valid HTTPS URL" });
                if (!b.organization) details.push({ parameter: "organization", message: "is required" });
                if (b.scope === "user" && !b.user) details.push({ parameter: "user", message: "is required" });
                if (details.length) return fail(400, "Invalid Argument", "The supplied parameters are invalid.", details);
                const uuid = `WH${++n}`, s = { uri: `${api}/webhook_subscriptions/${uuid}`, callback_url: b.url, events: b.events, scope: b.scope, state: "active" };
                hooks.set(uuid, s);
                return send(201, { resource: s });
            }
            if (p === "/webhook_subscriptions") return list([...hooks.values()].filter((h) => h.scope === q.get("scope")));
            if (m = /^\/webhook_subscriptions\/([^/]+)$/.exec(p)) return hooks.delete(m[1]) ? send(204) : fail(404, "Resource Not Found", "The server could not find the requested resource.");
            return fail(404, "Resource Not Found", "The server could not find the requested resource.");
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { CALENDLY_API_URL: base, CALENDLY_TOKEN: TOKEN },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.nexts) return "next_page_token was never followed";
            if (stats.tooMany) return "a list asked for more than 100";
            if (stats.noOwner) return "a list came without a user or organization";
            if (!stats.limited) return "the Calendly stand-in never saw a 429 waited out";
            if (!stats.cancels) return "the Calendly stand-in cancelled nothing";
            return null;
        },
    };
}
