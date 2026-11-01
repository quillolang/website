// Zoom's sign-in and API for the zoom plugin's test, written from developers.zoom.us ("Internal
// apps (Server-to-server)", the Meetings API reference, "Rate limits", and "Using webhooks"): POST
// /oauth/token with HTTP Basic, grant_type=account_credentials and account_id; /v2/users/:id/meetings
// with page_size (at most 300) and next_page_token; /v2/meetings/:id GET, PATCH 204, DELETE 204;
// PUT /status; /v2/past_meetings/:uuid/participants, where a UUID with a leading or double slash must
// reach the server still encoded once. Errors are { code, message, errors: [{ field, message }] };
// topic is at most 200 characters; 3001 for a meeting not found; X-RateLimit-Type on a 429.
//
//   start({ port }) -> { env: { ZOOM_API_URL, ZOOM_OAUTH_URL, ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET }, close(), check() }
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const ACCOUNT = "standinAccount", ID = "standinClient", SECRET = "standinSecret";

export async function start({ port }) {
    const stats = { tokens: 0, nexts: 0, doubleEncoded: 0, limited: 0, tooBig: 0, killed: 0 };
    const tokens = new Set(), meetings = new Map();
    let n = 85000000000;
    const past = [];
    for (let i = 0; i < 620; i++) past.push({ id: ++n, topic: `Old ${i}` });
    const users = [];
    for (let i = 0; i < 305; i++) users.push({ id: `u${i}`, email: `u${i}@example.com`, status: "active" });
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v, headers = {}) => { res.writeHead(code, { "content-type": "application/json", ...headers }); res.end(v === undefined ? "" : JSON.stringify(v)); };
            const fail = (status, code, message, errors, headers) => send(status, { code, message, ...(errors ? { errors } : {}) }, headers);
            const url = new URL(req.url, "http://x");
            const raw = url.pathname, q = url.searchParams;
            if (raw === "/oauth/token") {
                const f = new URLSearchParams(body);
                if (req.headers.authorization !== `Basic ${Buffer.from(`${ID}:${SECRET}`).toString("base64")}`) return send(400, { reason: "Invalid client_id or client_secret", error: "invalid_client" });
                if (f.get("grant_type") !== "account_credentials" || f.get("account_id") !== ACCOUNT) return send(400, { reason: "Invalid request : Redirect URI mismatch.", error: "invalid_request" });
                const t = "eyJ.standin." + randomBytes(16).toString("hex"); tokens.add(t); stats.tokens++;
                return send(200, { access_token: t, token_type: "bearer", expires_in: 3599, scope: "meeting:write:admin user:read:admin" });
            }
            if (!tokens.has((req.headers.authorization ?? "").replace(/^Bearer /, ""))) return fail(401, 124, "Invalid access token.");
            const p = raw.replace(/^\/v2/, "");
            const b = body ? JSON.parse(body) : {};
            const list = (field, all) => {
                const size = Number(q.get("page_size") ?? 30);
                if (size > 300) { stats.tooBig++; return fail(400, 300, "Invalid page_size"); }
                const t = q.get("next_page_token"), at = t ? Number(Buffer.from(t, "base64").toString()) : 0;
                if (t) stats.nexts++;
                const next = at + size < all.length ? Buffer.from(String(at + size)).toString("base64") : "";
                send(200, { page_size: size, total_records: all.length, next_page_token: next, [field]: all.slice(at, at + size) });
            };
            let m;
            if (p === "/busy") { if (!stats.limited) { stats.limited++; return fail(429, 429, "You have reached the maximum per-second rate limit for this API.", null, { "x-ratelimit-type": "QPS", "x-ratelimit-category": "Light" }); } return send(200, { ok: true }); }
            if (p === "/daily") return fail(429, 429, "You have reached the maximum daily rate limit for this API.", null, { "x-ratelimit-type": "Daily-limit", "retry-after": "2026-11-02T00:00:00Z" });
            if (p === "/expire") { if (!stats.killed) { stats.killed++; tokens.clear(); return fail(401, 124, "Access token is expired."); } return send(200, { ok: true }); }
            if (p === "/users") return list("users", users.filter((u) => !q.get("status") || u.status === q.get("status")));
            if (m = /^\/users\/([^/]+)\/meetings$/.exec(p)) {
                if (req.method === "GET") return list("meetings", past);
                if ((b.topic ?? "").length > 200) return fail(400, 300, "Validation Failed.", [{ field: "topic", message: "Invalid field." }]);
                const r = { id: ++n, ...b, host_email: "ada@example.com", join_url: `https://zoom.us/j/${n}`, start_url: `https://zoom.us/s/${n}?zak=x`, status: "waiting" };
                meetings.set(String(r.id), r);
                return send(201, r);
            }
            if (m = /^\/meetings\/(\d+)$/.exec(p)) {
                const r = meetings.get(m[1]);
                if (!r) return fail(404, 3001, `Meeting does not exist: ${m[1]}.`);
                if (req.method === "PATCH") { Object.assign(r, b); return send(204); }
                if (req.method === "DELETE") { meetings.delete(m[1]); return send(204); }
                return send(200, r);
            }
            if (m = /^\/meetings\/(\d+)\/status$/.exec(p)) { if (b.action !== "end") return fail(400, 300, "Invalid action"); return send(204); }
            if (m = /^\/past_meetings\/([^/]+)\/participants$/.exec(p)) {
                // Double-encoded: one layer goes in routing, and the id is still encoded after it.
                const once = decodeURIComponent(m[1]);
                if (/%2F/i.test(once)) stats.doubleEncoded++;
                const uuid = /%/.test(once) ? decodeURIComponent(once) : once;
                if ((uuid.startsWith("/") || uuid.includes("//")) && !/%2F/i.test(once)) return fail(404, 3001, "Meeting does not exist");
                return list("participants", [{ id: "p1", name: "Ada" }, { id: "p2", name: "Grace" }]);
            }
            return fail(404, 404, "Not found");
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    const base = `http://127.0.0.1:${port}`;
    return {
        env: { ZOOM_API_URL: `${base}/v2`, ZOOM_OAUTH_URL: base, ZOOM_ACCOUNT_ID: ACCOUNT, ZOOM_CLIENT_ID: ID, ZOOM_CLIENT_SECRET: SECRET },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (stats.tokens < 2) return "the Zoom stand-in saw no fresh token after one ran out";
            if (!stats.nexts) return "next_page_token was never followed";
            if (!stats.doubleEncoded) return "no UUID came double-encoded";
            if (!stats.limited) return "the Zoom stand-in never saw a 429 waited out";
            if (stats.tooBig) return "a list asked for more than 300";
            return null;
        },
    };
}
