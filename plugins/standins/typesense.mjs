// A Typesense API for the typesense plugin's test, written from Typesense's API reference
// ("Collections", "Documents", "Search", "API Keys"): X-TYPESENSE-API-KEY on every request,
// { message } errors, POST /collections with 409 on a name in use, documents with the schema's
// types checked, POST .../documents/import answering a line of { success } or { success: false,
// error, code, document } for each line of JSONL (with a 200 whatever the lines said), GET
// .../documents/search with query_by, filter_by (field:=value, values in backticks), sort_by,
// facet_by, per_page and page, and scoped keys: base64(digest + 4-character key prefix + params),
// the digest a base64 HMAC-SHA256 of params with the parent key, its filter_by ANDed to the search
// and expires_at honoured.
import { createServer } from "node:http";
import { createHmac } from "node:crypto";

const ADMIN = "standin-ts-admin", SEARCH = "searchonly-ts-key";

export async function start({ port }) {
    const stats = { imports: 0, searches: 0, scoped: 0, forged: 0, refusedLines: 0 };
    const cols = new Map();

    function scoped(key) {
        let raw;
        try { raw = Buffer.from(key, "base64").toString(); } catch { return null; }
        if (raw.length < 48) return null;
        const digest = raw.slice(0, 44), prefix = raw.slice(44, 48), params = raw.slice(48);
        if (prefix !== SEARCH.slice(0, 4)) return null;
        const want = createHmac("sha256", SEARCH).update(params).digest("base64");
        if (digest !== want) return null;
        try { return JSON.parse(params); } catch { return null; }
    }
    function typeOk(field, v) {
        if (v === undefined) return field.optional === true;
        if (field.type === "string") return typeof v === "string";
        if (field.type === "int32" || field.type === "int64") return Number.isInteger(v);
        if (field.type === "float") return typeof v === "number";
        return true;
    }
    function add(col, doc, action) {
        for (const f of col.fields) {
            if (doc[f.name] === undefined && !f.optional) return { code: 400, error: `Field \`${f.name}\` has been declared in the schema, but is not found in the document.` };
            if (!typeOk(f, doc[f.name])) return { code: 400, error: `Field \`${f.name}\` must be a ${f.type}.` };
        }
        const id = doc.id ?? String(col.docs.size + 1);
        if (action === "create" && col.docs.has(id)) return { code: 409, error: "A document with id " + id + " already exists." };
        col.docs.set(id, { ...doc, id });
        return null;
    }
    function filterParts(text) {
        // field:=value or field:=`value`, joined by &&.
        const out = [];
        for (const m of text.matchAll(/(\w+):=(?:`([^`]*)`|([^&\s]+))/g)) out.push([m[1], m[2] ?? m[3]]);
        return out;
    }

    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const url = new URL(req.url, "http://x");
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            const fail = (code, message) => send(code, { message });
            const key = req.headers["x-typesense-api-key"];
            let embed = null;
            if (key !== ADMIN && key !== SEARCH) {
                embed = key ? scoped(key) : null;
                if (!embed) { stats.forged++; return fail(401, "Forbidden - a valid `x-typesense-api-key` header must be sent."); }
                if (embed.expires_at && embed.expires_at * 1000 < Date.now()) return fail(401, "Forbidden - the key has expired");
                stats.scoped++;
            }
            const p = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
            if (key !== ADMIN && !(p[2] === "documents" && p[3] === "search")) return fail(401, "Forbidden - this key may only search.");
            if (p[0] === "keys") return send(201, { id: 3, value: "generated", description: "made", ...JSON.parse(body) });
            if (p[0] !== "collections") return fail(404, "Not Found");
            if (!p[1] && req.method === "POST") {
                const s = JSON.parse(body);
                if (cols.has(s.name)) return fail(409, `A collection with name \`${s.name}\` already exists.`);
                cols.set(s.name, { ...s, docs: new Map(), created_at: 1 });
                return send(201, { name: s.name, fields: s.fields, num_documents: 0, created_at: 1 });
            }
            const col = cols.get(p[1]);
            if (!col) return fail(404, `Not found.`);
            if (!p[2]) {
                if (req.method === "DELETE") { cols.delete(p[1]); return send(200, { name: p[1] }); }
                return send(200, { name: col.name, fields: col.fields, num_documents: col.docs.size, default_sorting_field: col.default_sorting_field });
            }
            if (p[2] !== "documents") return fail(404, "Not Found");
            if (p[3] === "import") {
                stats.imports++;
                if (!["create", "upsert", "update", "emplace"].includes(url.searchParams.get("action"))) return fail(400, "The `action` parameter must be create, upsert, update or emplace.");
                const lines = body.split("\n").map((l) => {
                    let d; try { d = JSON.parse(l); } catch { return { success: false, error: "Bad JSON.", code: 400, document: l }; }
                    const e = add(col, d, url.searchParams.get("action"));
                    if (e) { stats.refusedLines++; return { success: false, code: e.code, error: e.error, document: l }; }
                    return { success: true };
                });
                res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
                return res.end(lines.map((l) => JSON.stringify(l)).join("\n"));
            }
            if (p[3] === "search") {
                stats.searches++;
                const q = url.searchParams;
                if (!q.get("q")) return fail(400, "Parameter `q` is required.");
                const queryBy = (q.get("query_by") ?? "").split(",").filter(Boolean);
                if (q.get("q") !== "*" && !queryBy.length) return fail(400, "Parameter `query_by` is required.");
                for (const f of queryBy) if (!col.fields.some((x) => x.name === f)) return fail(404, `Could not find a field named \`${f}\` in the schema.`);
                const filters = filterParts([q.get("filter_by"), embed?.filter_by].filter(Boolean).join(" && "));
                const words = q.get("q") === "*" ? [] : q.get("q").toLowerCase().split(/\s+/);
                let rows = [...col.docs.values()].filter((d) => words.every((w) => queryBy.some((f) => String(d[f]).toLowerCase().split(/\s+/).includes(w))) && filters.every(([f, v]) => String(d[f]) === v));
                const sort = q.get("sort_by") ?? `${col.default_sorting_field}:desc`;
                const [sf, dir] = sort.split(":");
                rows.sort((a, b) => (dir === "asc" ? a[sf] - b[sf] : b[sf] - a[sf]));
                const facet_counts = (q.get("facet_by") ?? "").split(",").filter(Boolean).map((f) => {
                    const c = new Map(); for (const r of rows) c.set(r[f], (c.get(r[f]) ?? 0) + 1);
                    return { field_name: f, counts: [...c].map(([value, count]) => ({ count, highlighted: String(value), value: String(value) })), stats: {} };
                });
                const per = Number(q.get("per_page") ?? 10), page = Number(q.get("page") ?? 1);
                return send(200, { facet_counts, found: rows.length, out_of: col.docs.size, page, request_params: { per_page: per, q: q.get("q") }, search_time_ms: 1, hits: rows.slice((page - 1) * per, page * per).map((document) => ({ document, highlights: [], text_match: 100 })) });
            }
            if (p[3]) {
                const d = col.docs.get(p[3]);
                if (!d) return fail(404, `Could not find a document with id: ${p[3]}`);
                if (req.method === "DELETE") col.docs.delete(p[3]);
                return send(200, d);
            }
            if (req.method === "DELETE") {
                let n = 0; const fs = filterParts(url.searchParams.get("filter_by") ?? "");
                if (!fs.length) return fail(400, "Parameter `filter_by` must be provided.");
                for (const [id, d] of col.docs) if (fs.every(([f, v]) => String(d[f]) === v)) { col.docs.delete(id); n++; }
                return send(200, { num_deleted: n });
            }
            if (req.method === "POST") {
                const d = JSON.parse(body); const e = add(col, d, url.searchParams.get("action") ?? "create");
                return e ? fail(e.code, e.error) : send(201, d);
            }
            fail(404, "Not Found");
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { TYPESENSE_API_URL: `http://127.0.0.1:${port}`, TYPESENSE_API_KEY: ADMIN, TYPESENSE_SEARCH_KEY: SEARCH },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.imports || !stats.refusedLines) return "the Typesense stand-in saw no import with a refused line";
            if (!stats.scoped) return "no scoped key was accepted";
            if (!stats.forged) return "the forged key was not tried";
            return null;
        },
    };
}
