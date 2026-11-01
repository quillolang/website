// Cloud Firestore's REST API for the firestore plugin's test, written from Google's reference for
// projects.databases.documents (get, createDocument, patch with updateMask and currentDocument,
// delete, list, runQuery, batchWrite, commit) and its Value type. Requests need a token from the
// shared OAuth stand-in with the datastore scope. Field values must be typed: an unknown or
// untyped value is a 400, integerValue must be text. Errors are { error: { code, message, status } }.
// runQuery reads structuredQuery (from, where with fieldFilter, unaryFilter and compositeFilter
// AND, orderBy, startAt, limit, offset, select) and answers a list ending with a readTime-only entry.
// batchWrite answers per write with `status`; commit is all or nothing.
import { createServer } from "node:http";
import { googleAuth } from "./google_drive_oauth.mjs";

const SCOPE = "https://www.googleapis.com/auth/datastore";
const KINDS = ["nullValue", "booleanValue", "integerValue", "doubleValue", "timestampValue", "stringValue", "bytesValue", "referenceValue", "geoPointValue", "arrayValue", "mapValue"];

function plain(v) {
    const k = Object.keys(v)[0];
    if (k === "integerValue") return Number(v[k]);
    if (k === "arrayValue") return (v[k].values ?? []).map(plain);
    if (k === "mapValue") return v;
    return v[k];
}
function checkValue(v) {
    const ks = Object.keys(v ?? {});
    if (ks.length !== 1 || !KINDS.includes(ks[0])) throw { code: 400, status: "INVALID_ARGUMENT", message: `Invalid value at 'document.fields': ${JSON.stringify(v)}` };
    if (ks[0] === "integerValue" && typeof v.integerValue !== "string") throw { code: 400, status: "INVALID_ARGUMENT", message: "integerValue must be a text" };
    if (ks[0] === "referenceValue" && !/^projects\/[^/]+\/databases\/[^/]+\/documents\//.test(v.referenceValue)) throw { code: 400, status: "INVALID_ARGUMENT", message: "Invalid reference" };
    if (ks[0] === "arrayValue") (v.arrayValue.values ?? []).forEach(checkValue);
    if (ks[0] === "mapValue") Object.values(v.mapValue.fields ?? {}).forEach(checkValue);
}
function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

export async function start({ port }) {
    const auth = googleAuth({ scope: SCOPE, tokenUri: `http://127.0.0.1:${port}/token` });
    const stats = { reads: 0, writes: 0, queries: 0, batches: 0, commits: 0, masks: 0 };
    const docs = new Map();
    const stamp = () => new Date().toISOString();
    const prefix = "projects/quillo-test/databases/(default)/documents";
    const parts = (p) => p.split("/");
    function put(path, fields) {
        Object.values(fields ?? {}).forEach(checkValue);
        const had = docs.get(path);
        const d = { name: `${prefix}/${path}`, fields: fields ?? {}, createTime: had?.createTime ?? stamp(), updateTime: stamp() };
        docs.set(path, d);
        return d;
    }
    function setPath(fields, path, value) {
        const keys = path.split(".").map((k) => k.replace(/^`|`$/g, ""));
        let at = fields;
        for (const k of keys.slice(0, -1)) { at[k] ??= { mapValue: { fields: {} } }; at = (at[k].mapValue.fields ??= {}); }
        if (value === undefined) delete at[keys.at(-1)]; else at[keys.at(-1)] = value;
    }
    function getPath(fields, path) {
        let at = { mapValue: { fields } };
        for (const k of path.split(".").map((k) => k.replace(/^`|`$/g, ""))) at = at?.mapValue?.fields?.[k];
        return at;
    }
    function applyMask(path, fields, mask) {
        const d = docs.get(path), out = structuredClone(d?.fields ?? {});
        for (const m of mask) { stats.masks++; setPath(out, m, getPath(fields, m)); }
        return out;
    }
    function applyWrite(w) {
        // Gives an error object when the precondition fails, before anything changes.
        const path = (w.update?.name ?? w.delete).slice(prefix.length + 1);
        if (w.currentDocument?.exists === false && docs.has(path)) return { code: 6, status: "ALREADY_EXISTS", message: `Document already exists: ${path}` };
        if (w.currentDocument?.exists === true && !docs.has(path)) return { code: 5, status: "NOT_FOUND", message: `No document to update: ${path}` };
        return () => {
            if (w.delete) { docs.delete(path); return; }
            let fields = w.updateMask ? applyMask(path, w.update.fields, w.updateMask.fieldPaths) : w.update.fields;
            for (const t of w.updateTransforms ?? []) {
                if (t.increment) fields[t.fieldPath] = { integerValue: String(Number(fields[t.fieldPath]?.integerValue ?? 0) + Number(t.increment.integerValue)) };
                else if (t.setToServerValue === "REQUEST_TIME") fields[t.fieldPath] = { timestampValue: stamp() };
            }
            put(path, fields);
        };
    }
    function passes(f, d) {
        if (!f) return true;
        if (f.compositeFilter) return f.compositeFilter.filters.every((x) => passes(x, d));
        if (f.unaryFilter) {
            const v = getPath(d.fields, f.unaryFilter.field.fieldPath);
            const isNull = v !== undefined && "nullValue" in v;
            return f.unaryFilter.op === "IS_NULL" ? isNull : !isNull && v !== undefined;
        }
        const { field, op, value } = f.fieldFilter;
        checkValue(value);
        const have = getPath(d.fields, field.fieldPath);
        if (have === undefined) return false;
        const a = plain(have), b = plain(value);
        switch (op) {
            case "EQUAL": return a === b; case "NOT_EQUAL": return a !== b;
            case "LESS_THAN": return a < b; case "LESS_THAN_OR_EQUAL": return a <= b;
            case "GREATER_THAN": return a > b; case "GREATER_THAN_OR_EQUAL": return a >= b;
            case "IN": return b.includes(a); case "NOT_IN": return !b.includes(a);
            case "ARRAY_CONTAINS": return Array.isArray(a) && a.includes(b);
            case "ARRAY_CONTAINS_ANY": return Array.isArray(a) && a.some((x) => b.includes(x));
            default: throw { code: 400, status: "INVALID_ARGUMENT", message: `Invalid operator ${op}` };
        }
    }
    function runQuery(parent, q) {
        const from = q.from[0];
        let rows = [...docs.entries()].filter(([p]) => {
            const ps = parts(p);
            if (ps.length % 2) return false;
            const coll = ps[ps.length - 2], up = ps.slice(0, -2).join("/");
            return coll === from.collectionId && (from.allDescendants ? up.startsWith(parent) : up === parent);
        }).map(([, d]) => d).filter((d) => passes(q.where, d));
        const order = q.orderBy ?? [];
        rows.sort((x, y) => { for (const o of order) { const c = compare(plain(getPath(x.fields, o.field.fieldPath) ?? { nullValue: null }), plain(getPath(y.fields, o.field.fieldPath) ?? { nullValue: null })); if (c) return o.direction === "DESCENDING" ? -c : c; } return compare(x.name, y.name); });
        if (q.startAt) {
            const vals = q.startAt.values.map(plain);
            rows = rows.filter((d) => { for (let i = 0; i < vals.length; i++) { const c = compare(plain(getPath(d.fields, order[i].field.fieldPath)), vals[i]) * (order[i].direction === "DESCENDING" ? -1 : 1); if (c) return c > 0; } return q.startAt.before === true; });
        }
        rows = rows.slice(q.offset ?? 0, (q.offset ?? 0) + (q.limit ?? 1e9));
        const pick = (d) => { if (!q.select) return d; const f = {}; for (const s of q.select.fields) { const v = getPath(d.fields, s.fieldPath); if (v) f[s.fieldPath] = v; } return { ...d, fields: f }; };
        return rows.map((d) => ({ document: pick(d), readTime: stamp() })).concat(rows.length ? [] : [{ readTime: stamp() }]);
    }

    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const url = new URL(req.url, "http://x");
            if (url.pathname === "/token") return auth.token(body, res);
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json; charset=UTF-8" }); res.end(JSON.stringify(v)); };
            const fail = (e) => send(e.code, { error: { code: e.code, message: e.message, status: e.status } });
            if (!auth.valid(req.headers.authorization)) return fail({ code: 401, status: "UNAUTHENTICATED", message: "Request had invalid authentication credentials." });
            let path = decodeURIComponent(url.pathname);
            if (!path.startsWith(`/v1/${prefix}`)) return fail({ code: 403, status: "PERMISSION_DENIED", message: "Missing or insufficient permissions." });
            path = path.slice(`/v1/${prefix}`.length).replace(/^\//, "");
            const json = body ? JSON.parse(body) : null;
            try {
                const verb = /:(\w+)$/.exec(path)?.[1];
                if (verb) path = path.replace(/:\w+$/, "");
                if (verb === "runQuery") { stats.queries++; const r = runQuery(path, json.structuredQuery); return send(200, r); }
                if (verb === "batchWrite") {
                    stats.batches++;
                    const status = [], writeResults = [];
                    for (const w of json.writes) { const r = applyWrite(w); if (typeof r === "function") { r(); status.push({}); writeResults.push({ updateTime: stamp() }); } else { status.push({ code: r.code, message: r.message }); writeResults.push({}); } }
                    return send(200, { writeResults, status });
                }
                if (verb === "commit") {
                    stats.commits++;
                    const steps = json.writes.map(applyWrite);
                    const bad = steps.find((s) => typeof s !== "function");
                    if (bad) return fail({ code: bad.code === 6 ? 409 : 404, status: bad.status, message: bad.message });
                    steps.forEach((s) => s());
                    return send(200, { writeResults: steps.map(() => ({ updateTime: stamp() })), commitTime: stamp() });
                }
                const n = parts(path).length;
                if (req.method === "GET" && n % 2 === 1) {
                    const coll = [...docs.entries()].filter(([p]) => parts(p).length === n + 1 && p.startsWith(path + "/")).sort(([a], [b]) => compare(a, b));
                    const size = Number(url.searchParams.get("pageSize") ?? 20), at = Number(url.searchParams.get("pageToken") ?? 0);
                    const page = coll.slice(at, at + size).map(([, d]) => d);
                    return send(200, { documents: page, ...(at + size < coll.length ? { nextPageToken: String(at + size) } : {}) });
                }
                if (req.method === "GET") {
                    stats.reads++;
                    const d = docs.get(path);
                    return d ? send(200, d) : fail({ code: 404, status: "NOT_FOUND", message: `Document "${prefix}/${path}" not found.` });
                }
                if (req.method === "POST") {
                    stats.writes++;
                    const id = url.searchParams.get("documentId") ?? Math.random().toString(36).slice(2);
                    const p = `${path}/${id}`;
                    if (docs.has(p)) return fail({ code: 409, status: "ALREADY_EXISTS", message: `Document already exists: ${prefix}/${p}` });
                    return send(200, put(p, json.fields));
                }
                if (req.method === "PATCH") {
                    stats.writes++;
                    const exists = url.searchParams.get("currentDocument.exists");
                    if (exists === "true" && !docs.has(path)) return fail({ code: 404, status: "NOT_FOUND", message: `No document to update: ${prefix}/${path}` });
                    const mask = url.searchParams.getAll("updateMask.fieldPaths");
                    return send(200, put(path, mask.length ? applyMask(path, json.fields, mask) : json.fields));
                }
                if (req.method === "DELETE") { docs.delete(path); return send(200, {}); }
                fail({ code: 400, status: "INVALID_ARGUMENT", message: "Unknown call" });
            } catch (e) {
                if (e?.code) return fail(e);
                fail({ code: 500, status: "INTERNAL", message: String(e) });
            }
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { FIRESTORE_API_URL: `http://127.0.0.1:${port}`, GOOGLE_SERVICE_ACCOUNT_JSON: auth.account },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!auth.stats.granted) return `no token was granted: ${auth.stats.refused[0] ?? "no request"}`;
            if (auth.stats.granted > 1) return `the token was not kept: ${auth.stats.granted} asked for`;
            if (!stats.queries || !stats.batches || !stats.commits || !stats.masks) return "the stand-in missed queries, batches, commits or masks";
            return null;
        },
    };
}
