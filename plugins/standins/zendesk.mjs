// A Zendesk Support API for the zendesk plugin's test, written from developer.zendesk.com/api-reference:
// Basic auth as {email}/token:{api_token}, POST and PUT /api/v2/tickets (a comment is added by an
// update), /api/v2/tickets/{id}/comments, cursor paging (page[size], at most 100; meta.has_more,
// meta.after_cursor, links.next), /api/v2/search.json (per_page, a count, next_page),
// /api/v2/search/export.json (filter[type] required, page[size]). Errors: 401 { error }, 404
// { error: "RecordNotFound", description }, 422 { error: "RecordInvalid", description, details }; 429
// with Retry-After.
//
//   start({ port }) -> { env: { ZENDESK_API_URL, ZENDESK_EMAIL, ZENDESK_API_TOKEN, ZENDESK_WEBHOOK_SECRET }, close(), check() }
import { createServer } from "node:http";

const EMAIL = "agent@acme.test", TOKEN = "qktestzendesk";

export async function start({ port }) {
    const base = `http://127.0.0.1:${port}`;
    const stats = { created: 0, cursors: 0, exports: 0, comments: 0, limited: 0 };
    const tickets = new Map(), comments = new Map();
    let n = 100;
    for (let i = 0; i < 230; i++) { const id = ++n; tickets.set(id, { id, subject: `Old ${i}`, status: "open", tags: [] }); }
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v, h = {}) => { res.writeHead(code, { "content-type": "application/json", ...h }); res.end(JSON.stringify(v)); };
            const auth = Buffer.from((req.headers.authorization ?? "").replace("Basic ", ""), "base64").toString();
            if (auth !== `${EMAIL}/token:${TOKEN}`) return send(401, { error: "Couldn't authenticate you" });
            const url = new URL(req.url, base);
            const p = url.pathname, b = body ? JSON.parse(body) : {};
            const cursor = (all, key) => {
                const size = Number(url.searchParams.get("page[size]") ?? 100);
                if (size > 100) return send(400, { errors: [{ code: "InvalidPaginationParameter", title: "page[size] must be at most 100" }] });
                const after = url.searchParams.get("page[after]");
                if (after) stats.cursors++;
                const at = Number(after ?? 0), page = all.slice(at, at + size), more = at + size < all.length;
                const u = new URL(url); u.searchParams.set("page[after]", String(at + size));
                send(200, { [key]: page, meta: { has_more: more, after_cursor: more ? String(at + size) : null, before_cursor: null }, links: { next: more ? u.href : null, prev: null } });
            };
            let m;
            if (p === "/api/v2/users/me.json") {
                if (!stats.limited++) return send(429, { error: "APIRateLimitExceeded" }, { "retry-after": "1" });
                return send(200, { user: { id: 1, email: EMAIL } });
            }
            if (p === "/api/v2/tickets.json" && req.method === "POST") {
                const t = b.ticket;
                const bad = {};
                if (!t?.comment?.body) bad.description = [{ description: "Description: cannot be blank", error: "BlankValue" }];
                if (t?.priority && !["low", "normal", "high", "urgent"].includes(t.priority)) bad.priority = [{ description: `Priority: ${t.priority} is not valid`, error: "InvalidValue" }];
                if (Object.keys(bad).length) return send(422, { error: "RecordInvalid", description: "Record validation errors", details: bad });
                const id = ++n, ticket = { id, subject: t.subject, status: t.status ?? "new", priority: t.priority ?? null, tags: t.tags ?? [] };
                tickets.set(id, ticket); comments.set(id, [{ id: 1, body: t.comment.body, public: true }]);
                stats.created++;
                return send(201, { ticket, audit: {} });
            }
            if (p === "/api/v2/tickets.json") return cursor([...tickets.values()], "tickets");
            if (m = /^\/api\/v2\/tickets\/(\d+)\.json$/.exec(p)) {
                const t = tickets.get(Number(m[1]));
                if (!t) return send(404, { error: "RecordNotFound", description: "Not found" });
                if (req.method === "PUT") {
                    const u = b.ticket;
                    if (u.comment) { comments.get(t.id).push({ id: comments.get(t.id).length + 1, body: u.comment.body, public: u.comment.public !== false }); stats.comments++; }
                    if (u.status) t.status = u.status;
                    if (u.additional_tags) t.tags = [...t.tags, ...u.additional_tags];
                }
                return send(200, { ticket: t });
            }
            if (m = /^\/api\/v2\/tickets\/(\d+)\/comments\.json$/.exec(p)) return cursor(comments.get(Number(m[1])) ?? [], "comments");
            if (p === "/api/v2/search.json") {
                const q = url.searchParams.get("query");
                if (!q) return send(400, { error: "invalid", description: "query is required" });
                const hits = [...tickets.values()].filter((t) => q.includes(`status:${t.status}`));
                return send(200, { results: hits.slice(0, 100), count: hits.length, next_page: hits.length > 100 ? `${base}${p}?page=2` : null, previous_page: null });
            }
            if (p === "/api/v2/search/export.json") {
                if (!url.searchParams.get("filter[type]")) return send(400, { error: "invalid", description: "filter[type] is required" });
                stats.exports++;
                return cursor([...tickets.values()].filter((t) => url.searchParams.get("query").includes(`status:${t.status}`)).map((t) => ({ ...t, result_type: "ticket" })), "results");
            }
            send(404, { error: "InvalidEndpoint", description: "Not found" });
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { ZENDESK_API_URL: base, ZENDESK_EMAIL: EMAIL, ZENDESK_API_TOKEN: TOKEN, ZENDESK_WEBHOOK_SECRET: "zd-secret" },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.created || !stats.cursors || !stats.exports || !stats.comments) return `the Zendesk stand-in was not reached by everything: ${JSON.stringify(stats)}`;
            if (stats.limited < 2) return "the plugin did not wait out the 429";
            return null;
        },
    };
}
