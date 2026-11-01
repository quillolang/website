// A HubSpot CRM API for the hubspot plugin's test, written from developers.hubspot.com/docs/api/crm:
// Bearer tokens, /crm/v3/objects/{kind} (POST, GET with idProperty and properties, PATCH, DELETE 204,
// list with limit, after and paging.next.after), /search (filterGroups, at most 200 a page, 5 groups
// of 6), /batch/upsert (at most 100 inputs, id and idProperty, 200 or 207 with `errors`, `new` on
// each result), /crm/v4 default associations. Errors have the documented { status: "error", message,
// correlationId, category }; a taken email is a 409, a 429 has Retry-After, and a daily-limit 429
// says DAILY in policyName.
//
//   start({ port }) -> { env: { HUBSPOT_API_URL, HUBSPOT_TOKEN, HUBSPOT_CLIENT_SECRET }, close(), check() }
import { createServer } from "node:http";

const TOKEN = "qk-test-hubspot";

export async function start({ port }) {
    const stats = { created: 0, searches: 0, afters: 0, biggestBatch: 0, batches: 0, associated: 0, limited: 0, daily: 0 };
    const store = { contacts: new Map(), deals: new Map(), companies: new Map() };
    const assoc = new Map();
    let n = 500;
    for (let i = 0; i < 230; i++) { const id = String(++n); store.companies.set(id, { id, properties: { name: `Co ${i}`, state: i % 2 ? "closed" : "open" }, archived: false }); }
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(v === undefined ? "" : JSON.stringify(v)); };
            const fail = (code, category, message, extra = {}, headers = {}) => { res.writeHead(code, { "content-type": "application/json", ...headers }); res.end(JSON.stringify({ status: "error", message, correlationId: "aeb5f871", category, ...extra })); };
            if (req.headers.authorization !== `Bearer ${TOKEN}`) return fail(401, "INVALID_AUTHENTICATION", "Authentication credentials not found.");
            const url = new URL(req.url, "http://x");
            const b = body ? JSON.parse(body) : {};
            const path = url.pathname;
            let m;
            const emailOk = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
            if (m = /^\/crm\/v4\/objects\/(\w+)\/(\w+)\/associations\/default\/(\w+)\/(\w+)$/.exec(path)) {
                assoc.set(`${m[1]}/${m[2]}/${m[3]}`, [...(assoc.get(`${m[1]}/${m[2]}/${m[3]}`) ?? []), Number(m[4])]);
                stats.associated++;
                return send(200, { fromObjectTypeId: "0-3", fromObjectId: Number(m[2]), toObjectTypeId: "0-1", toObjectId: Number(m[4]), labels: [] });
            }
            if (m = /^\/crm\/v4\/objects\/(\w+)\/(\w+)\/associations\/(\w+)$/.exec(path)) return send(200, { results: (assoc.get(`${m[1]}/${m[2]}/${m[3]}`) ?? []).map((id) => ({ toObjectId: id, associationTypes: [] })) });
            m = /^\/crm\/v3\/objects\/(\w+)(?:\/(.+))?$/.exec(path);
            if (!m || !store[m[1]]) return fail(404, "OBJECT_NOT_FOUND", "resource not found");
            const objs = store[m[1]], rest = m[2];
            const make = (p) => { const id = String(++n); const o = { id, properties: { ...p, hs_object_id: id }, createdAt: "2026-11-01T10:00:00Z", archived: false }; objs.set(id, o); return o; };
            const byEmail = (e) => [...objs.values()].find((o) => o.properties.email === e);
            if (req.method === "POST" && !rest) {
                const e = b.properties?.email;
                if (e === "rate@example.com" && !stats.limited++) return fail(429, "RATE_LIMITS", "You have reached your ten_secondly_rolling limit.", { policyName: "TEN_SECONDLY_ROLLING" }, { "retry-after": "1" });
                if (e !== undefined && !emailOk(e)) return fail(400, "VALIDATION_ERROR", "Property values were not valid", { errors: [{ message: `Email address ${e} is invalid`, code: "INVALID_EMAIL" }] });
                if (e && byEmail(e)) return fail(409, "CONFLICT", `Contact already exists. Existing ID: ${byEmail(e).id}`);
                stats.created++;
                return send(201, make(b.properties));
            }
            if (rest === "search") {
                if ((b.limit ?? 10) > 200) return fail(400, "VALIDATION_ERROR", "limit must be at most 200");
                if ((b.filterGroups ?? []).length > 5) return fail(400, "VALIDATION_ERROR", "at most 5 filter groups");
                stats.searches++;
                const match = (o) => !(b.filterGroups ?? []).length || b.filterGroups.some((g) => g.filters.every((f) => o.properties[f.propertyName] === f.value));
                const all = [...objs.values()].filter(match);
                const at = Number(b.after ?? 0);
                if (b.after) stats.afters++;
                const page = all.slice(at, at + b.limit);
                return send(200, { total: all.length, results: page, ...(at + b.limit < all.length ? { paging: { next: { after: String(at + b.limit) } } } : {}) });
            }
            if (rest === "batch/upsert") {
                if (b.inputs.length > 100) return fail(400, "VALIDATION_ERROR", "at most 100 inputs");
                stats.batches++;
                stats.biggestBatch = Math.max(stats.biggestBatch, b.inputs.length);
                const results = [], errors = [];
                for (const i of b.inputs) {
                    if (i.idProperty !== "email" || !i.id) return fail(400, "VALIDATION_ERROR", "idProperty and id are required");
                    if (i.id !== i.id.toLowerCase()) return fail(400, "VALIDATION_ERROR", `Duplicate IDs found in batch input: ${i.id}`);
                    if (!emailOk(i.id)) { errors.push({ status: "error", category: "VALIDATION_ERROR", message: `Email address ${i.id} is invalid`, context: { id: [i.id] } }); continue; }
                    const had = byEmail(i.id);
                    if (had) { Object.assign(had.properties, i.properties); results.push({ ...had, new: false }); } else results.push({ ...make({ ...i.properties, email: i.id }), new: true });
                }
                return send(errors.length ? 207 : 200, { status: "COMPLETE", results, ...(errors.length ? { errors, numErrors: errors.length } : {}), startedAt: "t", completedAt: "t" });
            }
            if (!rest) {
                const limit = Number(url.searchParams.get("limit") ?? 10);
                if (limit > 100) return fail(400, "VALIDATION_ERROR", "limit must be at most 100");
                const all = [...objs.values()], after = url.searchParams.get("after");
                if (after) stats.afters++;
                const at = Number(after ?? 0), page = all.slice(at, at + limit);
                return send(200, { results: page, ...(at + limit < all.length ? { paging: { next: { after: String(at + limit), link: "x" } } } : {}) });
            }
            if (rest === "daily") return fail(429, "RATE_LIMITS", "You have reached your daily limit.", { policyName: "DAILY" });
            const o = url.searchParams.get("idProperty") === "email" ? byEmail(decodeURIComponent(rest)) : objs.get(rest);
            if (!o) return fail(404, "OBJECT_NOT_FOUND", "Object not found.  objectId are usually numeric.");
            if (req.method === "PATCH") { Object.assign(o.properties, b.properties); return send(200, o); }
            if (req.method === "DELETE") { objs.delete(rest); return send(204); }
            return send(200, o);
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { HUBSPOT_API_URL: `http://127.0.0.1:${port}`, HUBSPOT_TOKEN: TOKEN, HUBSPOT_CLIENT_SECRET: "hub-secret" },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.created || !stats.searches || !stats.afters || !stats.associated) return `the HubSpot stand-in was not reached by everything: ${JSON.stringify(stats)}`;
            if (stats.biggestBatch !== 100 || stats.batches < 4) return `batches were not in hundreds: ${JSON.stringify(stats)}`;
            if (stats.limited < 2) return "the plugin did not wait out the 429";
            return null;
        },
    };
}
