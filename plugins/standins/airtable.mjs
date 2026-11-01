// An Airtable Web API for the airtable plugin's test, written from airtable.com/developers/web/api:
// Bearer tokens, /v0/{base}/{table} with the table name percent-encoded, POST .../listRecords (view,
// filterByFormula, sort, fields, pageSize, offset, an offset that goes stale), POST create and PATCH
// update (at most 10 records a request), PATCH with performUpsert.fieldsToMergeOn (createdRecords,
// updatedRecords), DELETE records[]=, errors as { error: { type, message } } or { error: "NOT_FOUND" }.
// Five requests a second are allowed: this stand-in counts any request that comes too soon.
//
//   start({ port }) -> { env: { AIRTABLE_API_URL, AIRTABLE_TOKEN, AIRTABLE_BASE }, close(), check() }
import { createServer } from "node:http";

const TOKEN = "qk_test_airtable", BASE = "appQuilloTest0001";

export async function start({ port }) {
    const stats = { requests: 0, tooSoon: 0, biggest: 0, creates: 0, upserts: 0, offsets: 0, limited: 0 };
    const stamps = [];
    let n = 0;
    const big = Array.from({ length: 250 }, (_, i) => ({ id: `recBig${i}`, createdTime: "2026-11-01T10:00:00.000Z", fields: { Rank: 250 - i } }));
    const contacts = [];
    const FIELDS = ["Email", "Name", "Visits"];
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            const fail = (code, type, message) => send(code, { error: { type, message } });
            if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, { error: { type: "AUTHENTICATION_REQUIRED", message: "Authentication required" } });
            stats.requests++;
            // More than 5 in any second is what the real one punishes.
            const now = Date.now();
            stamps.push(now);
            if (stamps.filter((t) => now - t < 1000).length > 5) stats.tooSoon++;
            const url = new URL(req.url, "http://x");
            const m = /^\/v0\/([^/]+)\/([^/]+)(\/.*)?$/.exec(url.pathname);
            if (!m || m[1] !== BASE) return send(404, { error: "NOT_FOUND" });
            const table = decodeURIComponent(m[2]), rest = m[3] ?? "";
            if (m[2].includes(" ")) return send(400, { error: "bad path" });
            if (table !== "Contacts" && table !== "Big table") return send(404, { error: { type: "TABLE_NOT_FOUND", message: `Could not find table ${table} in application ${BASE}` } });
            const b = body ? JSON.parse(body) : {};
            const rows = table === "Big table" ? big : contacts;
            const make = (fields) => ({ id: `rec${String(++n).padStart(14, "0")}`, createdTime: "2026-11-01T10:00:00.000Z", fields });
            const checkFields = (recs) => {
                if (table !== "Contacts") return null;
                for (const r of recs) for (const k of Object.keys(r.fields ?? {})) if (!FIELDS.includes(k)) return k;
                return null;
            };
            if (req.method === "POST" && rest === "/listRecords") {
                if (b.offset === "stale") return fail(422, "LIST_RECORDS_ITERATOR_NOT_AVAILABLE", "The iterator is no longer available.");
                const size = b.pageSize ?? 100;
                if (size > 100) return fail(422, "INVALID_PAGE_SIZE", "pageSize must be at most 100");
                let all = rows;
                if (b.filterByFormula) {
                    const f = /^\{Email\} = '((?:[^'\\]|\\.)*)'$/.exec(b.filterByFormula);
                    if (!f) return fail(422, "INVALID_FILTER_BY_FORMULA", "The formula for filtering records is invalid");
                    const want = f[1].replace(/\\(.)/g, "$1");
                    all = rows.filter((r) => r.fields.Email === want);
                }
                if (b.offset) stats.offsets++;
                const at = Number(b.offset ?? 0);
                const out = all.slice(at, at + size);
                return send(200, { records: out, ...(at + size < all.length ? { offset: String(at + size) } : {}) });
            }
            if (req.method === "GET" && rest) { const r = rows.find((x) => `/${x.id}` === rest); return r ? send(200, r) : send(404, { error: "NOT_FOUND" }); }
            if (req.method === "DELETE") {
                const ids = url.searchParams.getAll("records[]");
                if (ids.length > 10) return fail(422, "INVALID_RECORDS", "too many records");
                stats.biggest = Math.max(stats.biggest, ids.length);
                for (const id of ids) { const i = contacts.findIndex((r) => r.id === id); if (i >= 0) contacts.splice(i, 1); }
                return send(200, { records: ids.map((id) => ({ id, deleted: true })) });
            }
            const recs = b.records;
            if (!Array.isArray(recs) || !recs.length) return fail(422, "INVALID_RECORDS", "records is required");
            if (recs.length > 10) return fail(422, "INVALID_RECORDS", "at most 10 records may be sent in one request");
            stats.biggest = Math.max(stats.biggest, recs.length);
            const bad = checkFields(recs);
            if (bad) return fail(422, "UNKNOWN_FIELD_NAME", `Unknown field name: "${bad}"`);
            if (req.method === "POST") {
                if (recs.some((r) => r.fields.Name === "rate me") && !stats.limited++) return send(429, { errors: [{ error: "RATE_LIMIT_REACHED", message: "Rate limit exceeded. Please try again later" }] });
                stats.creates++;
                const made = recs.map((r) => make(r.fields));
                contacts.push(...made);
                return send(200, { records: made });
            }
            if (req.method === "PATCH") {
                const up = b.performUpsert;
                if (up) {
                    if (!(up.fieldsToMergeOn?.length >= 1 && up.fieldsToMergeOn.length <= 3)) return fail(422, "INVALID_UPSERT", "fieldsToMergeOn must hold 1 to 3 fields");
                    stats.upserts++;
                    const createdRecords = [], updatedRecords = [], records = [];
                    for (const r of recs) {
                        const hit = contacts.find((c) => up.fieldsToMergeOn.every((f) => c.fields[f] === r.fields[f]));
                        if (hit) { Object.assign(hit.fields, r.fields); updatedRecords.push(hit.id); records.push(hit); } else { const x = make(r.fields); contacts.push(x); createdRecords.push(x.id); records.push(x); }
                    }
                    return send(200, { createdRecords, updatedRecords, records });
                }
                const out = [];
                for (const r of recs) { const hit = contacts.find((c) => c.id === r.id); if (!hit) return send(404, { error: "NOT_FOUND" }); Object.assign(hit.fields, r.fields); out.push(hit); }
                return send(200, { records: out });
            }
            send(404, { error: "NOT_FOUND" });
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { AIRTABLE_API_URL: `http://127.0.0.1:${port}`, AIRTABLE_TOKEN: TOKEN, AIRTABLE_BASE: BASE },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.creates || !stats.upserts || !stats.offsets) return `the Airtable stand-in was not reached by everything: ${JSON.stringify(stats)}`;
            if (stats.tooSoon) return `${stats.tooSoon} requests went over 5 a second`;
            if (stats.biggest !== 10) return `the biggest batch was ${stats.biggest}`;
            if (stats.limited < 2) return "the plugin did not wait out the 429";
            return null;
        },
    };
}
