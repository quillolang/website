// Google Calendar's API and token endpoint for the google_calendar plugin's test, written from
// developers.google.com/calendar/api/v3/reference, "Synchronize resources efficiently", "Handle API
// errors" and "Using OAuth 2.0 for Server to Server Applications": a service account's RS256 JWT with
// iss, aud, scope, iat, exp at most an hour away, and `sub` (a delegated user; one outside the domain
// is unauthorized_client). /calendars/:id/events with maxResults (at most 2500), pageToken,
// nextSyncToken on the last page, syncToken giving what changed, cancelled ones included, and a 410
// fullSyncRequired for an old token; POST, PATCH, DELETE (a second delete is a 410), start and end
// both dates or both times; /freeBusy. Errors are { error: { code, message, errors: [{ domain,
// reason, message }], status } }; a rateLimitExceeded 403 is given once.
//
//   start({ port }) -> { env: { GOOGLE_CALENDAR_API_URL, GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_CALENDAR_SUBJECT, GOOGLE_CALENDAR_ID }, close(), check() }
import { createServer } from "node:http";
import { generateKeyPairSync, createVerify, randomBytes } from "node:crypto";

const SCOPE = "https://www.googleapis.com/auth/calendar", EMAIL = "calendar@quillo-test.iam.gserviceaccount.com";

export async function start({ port }) {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const base = `http://127.0.0.1:${port}`;
    const tokenUri = `${base}/token`;
    const account = JSON.stringify({ type: "service_account", project_id: "quillo-test", private_key_id: "standin1", private_key: privateKey.export({ type: "pkcs8", format: "pem" }), client_email: EMAIL, token_uri: tokenUri });
    const stats = { granted: 0, subjects: new Set(), pages: 0, syncs: 0, gone: 0, limited: 0, tooMany: 0 };
    const tokens = new Map();
    const calendars = new Map();
    let n = 1, tick = 1;
    const cal = (id) => { if (!calendars.has(id)) calendars.set(id, new Map()); return calendars.get(id); };
    const event = (c, e) => { const id = `ev${++n}`; const r = { kind: "calendar#event", id, status: "confirmed", updatedAt: ++tick, ...e }; cal(c).set(id, r); return r; };
    for (let i = 0; i < 5200; i++) event("history@example.com", { summary: `Old ${i}` });
    for (let i = 0; i < 3; i++) event("sync@example.com", { summary: `S${i}` });
    event("primary", { summary: "Always here" });
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(v === undefined ? "" : JSON.stringify(v)); };
            const fail = (code, reason, message, status = "FAILED_PRECONDITION", domain = "calendar") => send(code, { error: { code, message, errors: [{ domain, reason, message }], status } });
            const url = new URL(req.url, "http://x");
            const p = url.pathname, q = url.searchParams;
            if (p === "/token") {
                const f = new URLSearchParams(body);
                const bad = (error, error_description) => send(400, { error, error_description });
                if (f.get("grant_type") !== "urn:ietf:params:oauth:grant-type:jwt-bearer") return bad("unsupported_grant_type", "Invalid grant_type");
                const [h, c64, s] = (f.get("assertion") ?? "").split(".");
                const c = JSON.parse(Buffer.from(c64 ?? "", "base64url").toString() || "{}");
                const v = createVerify("RSA-SHA256"); v.update(`${h}.${c64}`);
                if (!s || !v.verify(publicKey, Buffer.from(s, "base64url"))) return bad("invalid_grant", "Invalid JWT Signature.");
                if (c.iss !== EMAIL || c.aud !== tokenUri || !String(c.scope).split(" ").includes(SCOPE)) return bad("invalid_grant", "Invalid JWT claims");
                if (c.exp - c.iat > 3600) return bad("invalid_grant", "Invalid JWT: Token must be a short-lived token (60 minutes)");
                if (c.sub && !c.sub.endsWith("@example.com")) return bad("unauthorized_client", "Client is unauthorized to retrieve access tokens using this method, or client not authorized for any of the scopes requested.");
                const t = "qa29.standin-" + randomBytes(12).toString("hex");
                tokens.set(t, c.sub ?? null); stats.granted++; stats.subjects.add(c.sub ?? "");
                return send(200, { access_token: t, expires_in: 3599, token_type: "Bearer" });
            }
            const auth = (req.headers.authorization ?? "").replace(/^Bearer /, "");
            if (!tokens.has(auth)) return fail(401, "authError", "Invalid Credentials", "UNAUTHENTICATED", "global");
            const who = tokens.get(auth);
            const b = body ? JSON.parse(body) : {};
            let m;
            if (p === "/freeBusy") {
                if (!b.timeMin || !b.timeMax) return fail(400, "required", "Missing timeMin", "INVALID_ARGUMENT", "global");
                const out = {};
                for (const { id } of b.items) out[id] = id.startsWith("secret") ? { errors: [{ domain: "calendar", reason: "notFound" }], busy: [] } : { busy: [{ start: "2026-11-20T09:00:00Z", end: "2026-11-20T10:00:00Z" }] };
                return send(200, { kind: "calendar#freeBusy", timeMin: b.timeMin, timeMax: b.timeMax, calendars: out });
            }
            if (m = /^\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(p)) {
                const c = decodeURIComponent(m[1]), id = m[2] && decodeURIComponent(m[2]);
                if (c === "nobody@example.com") return fail(404, "notFound", "Not Found", "NOT_FOUND", "global");
                if (c === "whoami") return send(200, { items: [{ id: "w", summary: `Calendar of ${who}` }], nextSyncToken: "s" });
                if (!id && req.method === "GET") {
                    const max = Number(q.get("maxResults") ?? 250);
                    if (max > 2500) { stats.tooMany++; return fail(400, "invalid", "Invalid value for: maxResults", "INVALID_ARGUMENT", "global"); }
                    const sync = q.get("syncToken");
                    if (sync) {
                        if (q.get("timeMin")) return fail(400, "invalid", "Sync token cannot be used with other filters", "INVALID_ARGUMENT", "global");
                        if (!/^sync-\d+$/.test(sync)) { stats.gone++; return fail(410, "fullSyncRequired", "Sync token is no longer valid, a full sync is required.", "GONE"); }
                        stats.syncs++;
                    }
                    const since = sync ? Number(sync.slice(5)) : 0;
                    const all = [...cal(c).values()].filter((e) => (sync ? e.updatedAt > since : e.status !== "cancelled"));
                    const at = q.get("pageToken") ? Number(q.get("pageToken")) : 0;
                    if (at) stats.pages++;
                    const more = at + max < all.length;
                    return send(200, { kind: "calendar#events", items: all.slice(at, at + max), ...(more ? { nextPageToken: String(at + max) } : { nextSyncToken: `sync-${tick}` }) });
                }
                if (!id && req.method === "POST") {
                    if (!b.start || !b.end) return fail(400, "required", "Missing end time.", "INVALID_ARGUMENT", "global");
                    if (!!b.start.date !== !!b.end.date) return fail(400, "invalid", "Start and end times must either both be date or both be dateTime.", "INVALID_ARGUMENT", "global");
                    return send(200, { ...event(c, b), notified: q.get("sendUpdates") === "all" });
                }
                if (id === "busy") { if (!stats.limited) { stats.limited++; return fail(403, "rateLimitExceeded", "Rate Limit Exceeded", "PERMISSION_DENIED", "usageLimits"); } return send(200, { id, summary: "After the wait" }); }
                const e = cal(c).get(id);
                if (!e) return fail(404, "notFound", "Not Found", "NOT_FOUND", "global");
                if (req.method === "DELETE") { if (e.status === "cancelled") return fail(410, "deleted", "Resource has been deleted", "GONE"); e.status = "cancelled"; e.updatedAt = ++tick; return send(204); }
                if (req.method === "PATCH") { Object.assign(e, b); e.updatedAt = ++tick; }
                return send(200, e);
            }
            return fail(404, "notFound", "Not Found", "NOT_FOUND", "global");
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { GOOGLE_CALENDAR_API_URL: base, GOOGLE_SERVICE_ACCOUNT_JSON: account, GOOGLE_CALENDAR_SUBJECT: "ada@example.com", GOOGLE_CALENDAR_ID: "primary" },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (stats.subjects.size < 2) return "the Calendar stand-in did not see two subjects";
            if (stats.granted > stats.subjects.size + 1) return `tokens were not kept: ${stats.granted} for ${stats.subjects.size} subjects`;
            if (!stats.pages) return "nextPageToken was never followed";
            if (!stats.syncs || !stats.gone) return "the Calendar stand-in did not see a sync and a lost token";
            if (!stats.limited) return "the Calendar stand-in never saw a quota error waited out";
            if (stats.tooMany) return "a list asked for more than 2500";
            return null;
        },
    };
}
