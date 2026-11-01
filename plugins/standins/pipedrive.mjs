// A Pipedrive API for the pipedrive plugin's test, written from developers.pipedrive.com's v1 and v2
// references and "Rate limiting": x-api-token; /api/v2/deals, persons, activities with limit (at most
// 500) and cursor, additional_data.next_cursor; /v1/dealFields and personFields with start, limit and
// additional_data.pagination; custom fields as custom_fields keyed by 40-character hashes, enum and
// set values by option id, an unknown key refused; persons/search needing 2 characters. Errors are
// { success: false, error, error_info, data: null, additional_data: null }. Deal 777 gives a 429 once
// with x-ratelimit-reset, deal 778 a spent daily budget, deal 999998 a failure inside a 200.
//
//   start({ port }) -> { env: { PIPEDRIVE_API_URL, PIPEDRIVE_API_TOKEN }, close(), check() }
import { createServer } from "node:http";

const TOKEN = "qk-test-pipedrive";
const REGION = "a1f4f6c8e2d04b0f8a3c7f1e5b9d2c4e6f8a0b1c", SEATS = "b2e5a7d9f3c14e6a9d8b0c2f4e6a8c0d1e3f5a7b", CHANNELS = "c3d6b8eaf4d25f7bae9c1d3f5e7b9d1e2f4a6b8c";

export async function start({ port }) {
    const stats = { cursors: 0, fieldPages: 0, limited: 0, hashKeys: 0, badKeys: 0 };
    const deals = new Map(), persons = new Map(), activities = new Map();
    let n = 1000;
    for (let i = 0; i < 145; i++) { const id = ++n; deals.set(id, { id, title: `Old ${i}`, status: "open", custom_fields: {} }); }
    for (let i = 0; i < 105; i++) { const id = ++n; persons.set(id, { id, name: `Person ${i}` }); }
    deals.set(777, { id: 777, title: "After the wait", status: "won", custom_fields: {} });
    const dealFields = [
        { key: "title", name: "Title", field_type: "varchar" },
        { key: REGION, name: "Region", field_type: "enum", options: [{ id: 11, label: "Europe" }, { id: 12, label: "Asia" }] },
        { key: SEATS, name: "Seats", field_type: "double" },
        { key: CHANNELS, name: "Channels", field_type: "set", options: [{ id: 21, label: "Web" }, { id: 22, label: "Phone" }] },
    ];
    for (let i = 0; i < 2; i++) dealFields.push({ key: `extra${i}`, name: `Extra ${i}`, field_type: "varchar" });
    const hash = /^[0-9a-f]{40}$/;
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v, headers = {}) => { res.writeHead(code, { "content-type": "application/json", "x-ratelimit-limit": "80", "x-ratelimit-remaining": "79", "x-ratelimit-reset": "2", ...headers }); res.end(JSON.stringify(v)); };
            const fail = (code, error, error_info, headers) => send(code, { success: false, error, error_info, data: null, additional_data: null }, headers);
            if (req.headers["x-api-token"] !== TOKEN) return fail(401, "unauthorized access", "Please check developers.pipedrive.com");
            const url = new URL(req.url, "http://x");
            const p = url.pathname, q = url.searchParams;
            const b = body ? JSON.parse(body) : {};
            const list = (all) => {
                const limit = Number(q.get("limit") ?? 100), at = q.get("cursor") ? Number(Buffer.from(q.get("cursor"), "base64").toString()) : 0;
                if (limit > 500) return fail(400, "limit must be at most 500");
                if (q.get("cursor")) stats.cursors++;
                const more = at + limit < all.length;
                send(200, { success: true, data: all.slice(at, at + limit), additional_data: { next_cursor: more ? Buffer.from(String(at + limit)).toString("base64") : null } });
            };
            const custom = (fields) => {
                for (const k of Object.keys(fields ?? {})) { if (!hash.test(k)) { stats.badKeys++; return k; } stats.hashKeys++; }
                return null;
            };
            let m;
            if (p === "/v1/dealFields" || p === "/v1/personFields") {
                const all = p === "/v1/dealFields" ? dealFields : [{ key: "name", name: "Name", field_type: "varchar" }];
                const start = Number(q.get("start") ?? 0), limit = Math.min(Number(q.get("limit") ?? 100), 2);
                if (start) stats.fieldPages++;
                const more = start + limit < all.length;
                return send(200, { success: true, data: all.slice(start, start + limit), additional_data: { pagination: { start, limit, more_items_in_collection: more, ...(more ? { next_start: start + limit } : {}) } } });
            }
            if (p === "/api/v2/deals" && req.method === "POST") {
                const bad = custom(b.custom_fields);
                if (bad) return fail(400, `Unknown custom field ${bad}`);
                const d = { id: ++n, status: "open", ...b, custom_fields: b.custom_fields ?? {} };
                deals.set(d.id, d);
                return send(201, { success: true, data: d, additional_data: null });
            }
            if (p === "/api/v2/deals") return list([...deals.values()].filter((d) => !q.get("status") || d.status === q.get("status")));
            if (m = /^\/api\/v2\/deals\/(\d+)$/.exec(p)) {
                if (m[1] === "777" && !stats.limited) { stats.limited++; return fail(429, "Rate limit exceeded", "Slow down", { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1" }); }
                if (m[1] === "778") return fail(429, "Daily budget exceeded", "", { "x-daily-requests-left": "0" });
                if (m[1] === "999998") return send(200, { success: false, error: "Deal is in a broken state", data: null });
                const d = deals.get(Number(m[1]));
                if (!d) return fail(404, "Deal not found", "Please check developers.pipedrive.com for more information about Pipedrive API.");
                if (req.method === "PATCH") { const { custom_fields, ...rest } = b; Object.assign(d, rest); Object.assign(d.custom_fields, custom_fields); }
                return send(200, { success: true, data: d, additional_data: null });
            }
            if (p === "/api/v2/persons/search") {
                const term = q.get("term") ?? "";
                if (term.length < 2) return fail(400, "Search term must be at least 2 characters long");
                return send(200, { success: true, data: { items: [...persons.values()].filter((x) => x.name.includes(term)).map((item) => ({ result_score: 1, item })) } });
            }
            if (p === "/api/v2/persons" && req.method === "POST") {
                if (b.emails?.some((e) => typeof e !== "object")) return fail(400, "emails must be objects");
                const r = { id: ++n, ...b };
                persons.set(r.id, r);
                return send(201, { success: true, data: r });
            }
            if (p === "/api/v2/persons") return list([...persons.values()]);
            if (m = /^\/api\/v2\/persons\/(\d+)$/.exec(p)) return persons.has(Number(m[1])) ? send(200, { success: true, data: persons.get(Number(m[1])) }) : fail(404, "Person not found");
            if (p === "/api/v2/activities" && req.method === "POST") { const a = { id: ++n, done: false, ...b }; activities.set(a.id, a); return send(201, { success: true, data: a }); }
            if (p === "/api/v2/activities") return list([...activities.values()].filter((a) => !q.get("deal_id") || a.deal_id === Number(q.get("deal_id"))));
            if (m = /^\/api\/v2\/activities\/(\d+)$/.exec(p)) { const a = activities.get(Number(m[1])); if (!a) return fail(404, "Activity not found"); Object.assign(a, b); return send(200, { success: true, data: a }); }
            return fail(404, "Unknown endpoint");
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { PIPEDRIVE_API_URL: `http://127.0.0.1:${port}`, PIPEDRIVE_API_TOKEN: TOKEN },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.cursors) return "the Pipedrive stand-in's cursor was never followed";
            if (!stats.fieldPages) return "the Pipedrive stand-in's v1 pages were never followed";
            if (!stats.hashKeys) return "no custom field reached the Pipedrive stand-in by its key";
            if (stats.badKeys) return "a custom field reached the Pipedrive stand-in by something else than its key";
            if (!stats.limited) return "the Pipedrive stand-in never saw a 429 waited out";
            return null;
        },
    };
}
