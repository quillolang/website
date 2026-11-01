// An Algolia Search API for the algolia plugin's test, written from algolia.com/doc/rest-api/search
// and "Retry strategy": X-Algolia-Application-Id and X-Algolia-API-Key; PUT and POST objects, partial
// with createIfNotExists and _operation Increment and AddUnique, /batch with at most 1000 here,
// updateObject, addObject, partialUpdateObject(NoCreate); /query with filters, facets and
// facets_stats, hitsPerPage, page, and paginationLimitedTo 1000; /facets/:facet/query only on a
// searchable facet; /browse with a cursor; /settings; /task/:id, not published at first. Errors are
// { message, status }. Three addresses: the first refuses connections, the second always answers a
// 500, the third is the real one.
//
//   start({ port, ports }) -> { env: { ALGOLIA_HOSTS, ALGOLIA_APP_ID, ALGOLIA_API_KEY }, close(), check() }
import { createServer } from "node:http";

const APP = "QK12APPID", KEY = "qk-test-algolia";

export async function start({ ports }) {
    const stats = { broken: 0, good: 0, biggestBatch: 0, polls: 0, cursors: 0, reads: 0 };
    const indexes = new Map();
    let task = 100, cursorN = 0;
    const pending = new Map();
    const idx = (n) => { if (!indexes.has(n)) indexes.set(n, { objects: new Map(), settings: {} }); return indexes.get(n); };
    for (let i = 0; i < 3200; i++) idx("catalog").objects.set(`c${i}`, { objectID: `c${i}`, name: `Thing ${i}` });
    const cursors = new Map();
    const newTask = () => { const t = ++task; pending.set(t, 2); return t; };
    const op = (old, v) => {
        if (v?._operation === "Increment") return (old ?? 0) + v.value;
        if (v?._operation === "AddUnique") return [...new Set([...(old ?? []), v.value])];
        return v;
    };
    const apply = (rec, fields) => { for (const [k, v] of Object.entries(fields)) rec[k] = op(rec[k], v); };
    const brokenServer = createServer((req, res) => {
        stats.broken++;
        req.resume();
        req.on("end", () => { res.writeHead(500, { "content-type": "application/json" }); res.end(JSON.stringify({ message: "Internal error", status: 500 })); });
    });
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            stats.good++;
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            const fail = (status, message) => send(status, { message, status });
            if (req.headers["x-algolia-application-id"] !== APP || req.headers["x-algolia-api-key"] !== KEY) return fail(403, "Invalid Application-ID or API key");
            const url = new URL(req.url, "http://x");
            const b = body ? JSON.parse(body) : {};
            const m = /^\/1\/indexes\/([^/]+)(?:\/(.+))?$/.exec(url.pathname);
            if (!m) return fail(404, "Not found");
            const name = decodeURIComponent(m[1]), rest = m[2] ?? "";
            if (name === "forbidden") return fail(403, "Index not allowed with this API key");
            const ix = idx(name);
            let t;
            if (rest === "" && req.method === "POST") { const objectID = `auto${++task}`; ix.objects.set(objectID, { objectID, ...b }); return send(201, { createdAt: "2026-11-01T00:00:00Z", taskID: newTask(), objectID }); }
            if (rest === "batch") {
                stats.biggestBatch = Math.max(stats.biggestBatch, b.requests.length);
                if (b.requests.length > 1000) return fail(400, "Too many requests in a batch");
                const objectIDs = [];
                for (const r of b.requests) {
                    const id = r.body.objectID ?? `auto${++task}`;
                    objectIDs.push(id);
                    if (r.action === "addObject" || r.action === "updateObject") ix.objects.set(id, { objectID: id, ...r.body });
                    else if (r.action === "partialUpdateObject") { const rec = ix.objects.get(id) ?? { objectID: id }; apply(rec, r.body); ix.objects.set(id, rec); }
                    else if (r.action === "partialUpdateObjectNoCreate") { if (ix.objects.has(id)) apply(ix.objects.get(id), r.body); }
                    else return fail(400, `Invalid action: ${r.action}`);
                }
                return send(200, { taskID: newTask(), objectIDs });
            }
            if (rest === "query") {
                if (/[<>=]$/.test(b.filters ?? "")) return fail(400, "invalid filters: Unexpected token at col 6");
                const per = b.hitsPerPage ?? 20, page = b.page ?? 0;
                const f = /^brand:"((?:[^"\\]|\\.)*)"$/.exec(b.filters ?? "");
                const q = (b.query ?? "").toLowerCase();
                const all = [...ix.objects.values()].filter((o) => (!q || String(o.name ?? "").toLowerCase().includes(q)) && (!f || o.brand === f[1]));
                const reach = all.slice(0, 1000);
                const facets = {};
                for (const a of b.facets ?? []) { facets[a] = {}; for (const o of all) if (o[a]) facets[a][o[a]] = (facets[a][o[a]] ?? 0) + 1; }
                const prices = all.map((o) => o.price).filter((x) => typeof x === "number");
                return send(200, { hits: reach.slice(page * per, (page + 1) * per), nbHits: all.length, page, nbPages: Math.ceil(reach.length / per), hitsPerPage: per, exhaustiveNbHits: true, query: b.query, processingTimeMS: 1, facets, ...(prices.length ? { facets_stats: { price: { min: Math.min(...prices), max: Math.max(...prices), avg: 0, sum: 0 } } } : {}) });
            }
            if (t = /^facets\/([^/]+)\/query$/.exec(rest)) {
                if (t[1] !== "brand") return fail(400, `Cannot search in \`${t[1]}\` attribute, you need to add \`searchable(${t[1]})\` to attributesForFaceting.`);
                const counts = {};
                for (const o of ix.objects.values()) if (o.brand?.toLowerCase().startsWith((b.facetQuery ?? "").toLowerCase())) counts[o.brand] = (counts[o.brand] ?? 0) + 1;
                return send(200, { facetHits: Object.entries(counts).map(([value, count]) => ({ value, highlighted: value, count })), exhaustiveFacetsCount: true, processingTimeMS: 1 });
            }
            if (rest === "browse") {
                let list, at = 0;
                if (b.cursor) { const c = cursors.get(b.cursor); if (!c) return fail(400, "invalid cursor"); list = c.list; at = c.at; stats.cursors++; } else list = [...ix.objects.values()];
                const per = b.hitsPerPage ?? 1000;
                const out = { hits: list.slice(at, at + per), nbHits: list.length, processingTimeMS: 1 };
                if (at + per < list.length) { const c = `cur${++cursorN}`; cursors.set(c, { list, at: at + per }); out.cursor = c; }
                return send(200, out);
            }
            if (rest === "settings") {
                if (req.method === "PUT") { Object.assign(ix.settings, b); return send(200, { updatedAt: "2026-11-01T00:00:00Z", taskID: newTask() }); }
                return send(200, ix.settings);
            }
            if (t = /^task\/(\d+)$/.exec(rest)) {
                stats.polls++;
                const left = pending.get(Number(t[1]));
                if (left === undefined) return send(200, { status: "notPublished", pendingTask: true });
                if (left > 0) { pending.set(Number(t[1]), left - 1); return send(200, { status: "notPublished", pendingTask: true }); }
                return send(200, { status: "published", pendingTask: false });
            }
            if (t = /^(.+)\/partial$/.exec(rest)) {
                const id = decodeURIComponent(t[1]);
                const create = url.searchParams.get("createIfNotExists") !== "false";
                let rec = ix.objects.get(id);
                if (!rec && !create) return send(200, { updatedAt: "2026-11-01T00:00:00Z", taskID: newTask(), objectID: id });
                rec = rec ?? { objectID: id };
                apply(rec, b); ix.objects.set(id, rec);
                return send(200, { updatedAt: "2026-11-01T00:00:00Z", taskID: newTask(), objectID: id });
            }
            const id = decodeURIComponent(rest);
            if (req.method === "PUT") { ix.objects.set(id, { ...b, objectID: id }); return send(200, { updatedAt: "2026-11-01T00:00:00Z", taskID: newTask(), objectID: id }); }
            if (req.method === "DELETE") { ix.objects.delete(id); return send(200, { deletedAt: "2026-11-01T00:00:00Z", taskID: newTask() }); }
            const rec = ix.objects.get(id);
            if (!rec) return fail(404, "ObjectID does not exist");
            stats.reads++;
            const want = url.searchParams.get("attributesToRetrieve");
            return send(200, want ? { objectID: id, ...Object.fromEntries(want.split(",").map((k) => [k, rec[k]])) } : rec);
        });
    });
    await new Promise((ok) => brokenServer.listen(ports[1], "127.0.0.1", ok));
    await new Promise((ok) => server.listen(ports[2], "127.0.0.1", ok));
    return {
        env: { ALGOLIA_HOSTS: `http://127.0.0.1:${ports[0]},http://127.0.0.1:${ports[1]},http://127.0.0.1:${ports[2]}`, ALGOLIA_APP_ID: APP, ALGOLIA_API_KEY: KEY },
        close() { server.close(); brokenServer.close(); server.closeAllConnections?.(); brokenServer.closeAllConnections?.(); },
        check() {
            if (!stats.good) return "the Algolia stand-in got nothing";
            if (stats.broken !== 1) return `the broken host was asked ${stats.broken} times, not once and then left alone`;
            if (stats.biggestBatch > 1000) return "a batch held more than 1000";
            if (!stats.polls) return "no task was waited on";
            if (!stats.cursors) return "a cursor was never followed";
            return null;
        },
    };
}
