// An Elasticsearch REST API for the elasticsearch plugin's test, written from Elastic's REST API
// reference and OpenSearch's: GET / (with `version.distribution` on OpenSearch), index create and
// delete, _doc writes with if_seq_no/if_primary_term and op_type, _update, _count, _search with
// match, term, range and match_all, sort and search_after, _bulk (Content-Type must be
// application/x-ndjson, the body must end in a newline, and each item is answered on its own, with
// mapper_parsing_exception for a bad number, version_conflict_engine_exception for a create on an
// id in use, 404 for a delete on none, and 429 es_rejected_execution_exception once, to see it
// sent again), and points in time: _pit on Elasticsearch, _search/point_in_time on OpenSearch.
// After one whole scan the stand-in answers as OpenSearch, so the test sees both.
// An API key is required.
import { createServer } from "node:http";

const KEY = "standin-es-key";

export async function start({ port }) {
    const stats = { bulk: 0, rejected: 0, resent: 0, opened: 0, closed: 0, flavours: new Set() };
    const indices = new Map();
    const pits = new Map();
    let flavour = "elasticsearch", seq = 0, rejectOnce = true;
    const err = (type, reason, extra = {}) => ({ type, reason, ...extra });
    const notFound = (i) => err("index_not_found_exception", `no such index [${i}]`, { "resource.id": i, index: i });

    function typeCheck(idx, doc) {
        for (const [k, v] of Object.entries(doc)) {
            if (idx.mappings?.properties?.[k]?.type === "float" && typeof v !== "number")
                return err("mapper_parsing_exception", `failed to parse field [${k}] of type [float]`, { caused_by: err("number_format_exception", `For input string: "${v}"`) });
        }
        return null;
    }
    function put(index, id, doc, create) {
        if (!indices.has(index)) indices.set(index, { docs: new Map(), mappings: {} });
        const idx = indices.get(index);
        const bad = typeCheck(idx, doc);
        if (bad) return { status: 400, error: bad };
        const had = idx.docs.get(id);
        if (had && create) return { status: 409, error: err("version_conflict_engine_exception", `[${id}]: version conflict, document already exists (current version [${had.version}])`) };
        const entry = { source: doc, version: (had?.version ?? 0) + 1, seq: seq++, term: 1 };
        idx.docs.set(id, entry);
        return { status: had ? 200 : 201, result: had ? "updated" : "created", entry };
    }
    const value = (d, sortItem) => { const f = typeof sortItem === "string" ? sortItem : Object.keys(sortItem)[0]; return f === "_shard_doc" ? d.seq : d.source[f]; };
    function matches(q, id, d) {
        if (!q || q.match_all) return true;
        if (q.match) { const [f, t] = Object.entries(q.match)[0]; return String(d.source[f] ?? "").toLowerCase().split(/\s+/).includes(String(t).toLowerCase()); }
        if (q.term) { const [f, t] = Object.entries(q.term)[0]; return d.source[f] === (t.value ?? t); }
        if (q.range) { const [f, r] = Object.entries(q.range)[0]; const v = d.source[f]; return (r.gte == null || v >= r.gte) && (r.lte == null || v <= r.lte) && (r.gt == null || v > r.gt) && (r.lt == null || v < r.lt); }
        return false;
    }
    function run(names, body, res, snapshot) {
        const size = body.size ?? 10;
        const all = [];
        for (const n of names) for (const [id, d] of (snapshot?.get(n) ?? indices.get(n).docs)) if (matches(body.query, id, d)) all.push({ n, id, d });
        const sort = body.sort ?? [];
        const dir = (s) => (typeof s === "string" ? "asc" : (Object.values(s)[0].order ?? Object.values(s)[0]));
        all.sort((a, b) => { for (const s of sort) { const x = value(a.d, s), y = value(b.d, s); if (x < y) return dir(s) === "asc" ? -1 : 1; if (x > y) return dir(s) === "asc" ? 1 : -1; } return 0; });
        let rows = all;
        if (body.search_after) {
            if (!sort.length) return res(400, { error: err("illegal_argument_exception", "search_after needs sort"), status: 400 });
            rows = all.filter(({ d }) => { for (let i = 0; i < sort.length; i++) { const x = value(d, sort[i]), y = body.search_after[i]; if (x !== y) return dir(sort[i]) === "asc" ? x > y : x < y; } return false; });
        }
        const hits = rows.slice(body.from ?? 0, (body.from ?? 0) + size).map(({ n, id, d }) => ({ _index: n, _id: id, _score: sort.length ? null : 1, _source: d.source, ...(sort.length ? { sort: sort.map((s) => value(d, s)) } : {}) }));
        res(200, { took: 1, timed_out: false, _shards: { total: 1, successful: 1, skipped: 0, failed: 0 }, hits: { total: { value: all.length, relation: "eq" }, max_score: null, hits } });
    }

    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const url = new URL(req.url, "http://x");
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json", ...(flavour === "elasticsearch" ? { "x-elastic-product": "Elasticsearch" } : {}) }); res.end(JSON.stringify(v)); };
            const fail = (code, e) => send(code, { error: { root_cause: [e], ...e }, status: code });
            if (req.headers.authorization !== `ApiKey ${KEY}`) return fail(401, err("security_exception", "missing authentication credentials for REST request [" + req.url + "]"));
            const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
            let json = null;
            if (body && !(parts[0] === "_bulk")) { try { json = JSON.parse(body); } catch { return fail(400, err("parsing_exception", "request body is not JSON")); } }
            if (!parts.length) {
                stats.flavours.add(flavour);
                return send(200, { name: "node-1", cluster_name: "standin", version: flavour === "opensearch" ? { distribution: "opensearch", number: "2.11.0" } : { number: "8.11.0", build_flavor: "default" }, tagline: "You Know, for Search" });
            }
            if (parts[0] === "_bulk") {
                if (!/^application\/x-ndjson/.test(req.headers["content-type"] ?? "")) return fail(406, err("media_type_header_exception", "Content-Type header [" + req.headers["content-type"] + "] is not supported"));
                if (!body.endsWith("\n")) return fail(400, err("illegal_argument_exception", "The bulk request must be terminated by a newline [\\n]"));
                stats.bulk++;
                const lines = body.split("\n").slice(0, -1), items = [];
                for (let i = 0; i < lines.length;) {
                    const head = JSON.parse(lines[i++]);
                    const [op, meta] = Object.entries(head)[0];
                    const doc = op === "delete" ? null : JSON.parse(lines[i++]);
                    const index = meta._index, id = meta._id ?? `gen${seq}`;
                    const out = { _index: index, _id: id };
                    if (rejectOnce && id === "p4") { rejectOnce = false; stats.rejected++; items.push({ [op]: { ...out, status: 429, error: err("es_rejected_execution_exception", "rejected execution of coordinating operation") } }); continue; }
                    if (id === "p4" && !rejectOnce) stats.resent++;
                    if (op === "delete") {
                        const had = indices.get(index)?.docs.delete(id);
                        items.push({ delete: { ...out, status: had ? 200 : 404, result: had ? "deleted" : "not_found" } });
                    } else if (op === "update") {
                        const had = indices.get(index)?.docs.get(id);
                        if (!had) { items.push({ update: { ...out, status: 404, error: err("document_missing_exception", `[${id}]: document missing`) } }); continue; }
                        const r = put(index, id, { ...had.source, ...doc.doc }, false);
                        items.push({ update: { ...out, status: r.status, result: r.result } });
                    } else {
                        const r = put(index, id, doc, op === "create");
                        items.push({ [op]: { ...out, status: r.status, ...(r.error ? { error: r.error } : { result: r.result }) } });
                    }
                }
                return send(200, { took: 3, errors: items.some((x) => Object.values(x)[0].error), items });
            }
            // Points in time.
            if (parts[0] === "_pit" && req.method === "DELETE") { if (flavour !== "elasticsearch") return fail(400, err("illegal_argument_exception", "no handler")); if (!pits.delete(json?.id)) return send(404, { succeeded: true, num_freed: 0 }); stats.closed++; send(200, { succeeded: true, num_freed: 1 }); flavour = "opensearch"; return; }
            if (parts[0] === "_search" && parts[1] === "point_in_time" && req.method === "DELETE") { if (flavour !== "opensearch") return fail(400, err("illegal_argument_exception", "no handler")); pits.delete(json?.pit_id?.[0]); stats.closed++; flavour = "elasticsearch"; return send(200, { pits: [{ successful: true, pit_id: json?.pit_id?.[0] }] }); }
            if (parts[0] === "_search" && !parts[1]) {
                const pit = pits.get(json?.pit?.id);
                if (!pit) return fail(404, err("search_context_missing_exception", "No search context found"));
                return run([pit.index], json, send, new Map([[pit.index, pit.docs]]));
            }
            const index = parts[0];
            if (parts[1] === "_pit" || (parts[1] === "_search" && parts[2] === "point_in_time")) {
                const wanted = parts[1] === "_pit" ? "elasticsearch" : "opensearch";
                if (wanted !== flavour) return fail(400, err("illegal_argument_exception", `request [${url.pathname}] contains unrecognized path`));
                if (!url.searchParams.get("keep_alive")) return fail(400, err("action_request_validation_exception", "Validation Failed: 1: [keep_alive] is required;"));
                if (!indices.has(index)) return fail(404, notFound(index));
                const id = `pit-${pits.size + 1}-${flavour}`;
                pits.set(id, { index, docs: new Map(indices.get(index).docs) });
                stats.opened++;
                if (flavour === "elasticsearch") return send(200, { id });
                return send(200, { pit_id: id, _shards: { total: 1, successful: 1 }, creation_time: Date.now() });
            }
            if (parts.length === 1) {
                if (req.method === "PUT") {
                    if (indices.has(index)) return fail(400, err("resource_already_exists_exception", `index [${index}/abc] already exists`));
                    indices.set(index, { docs: new Map(), mappings: json?.mappings ?? {} });
                    return send(200, { acknowledged: true, shards_acknowledged: true, index });
                }
                if (req.method === "DELETE") return indices.delete(index) ? send(200, { acknowledged: true }) : fail(404, notFound(index));
            }
            if (parts[1] === "_search") { if (!indices.has(index)) return fail(404, notFound(index)); return run([index], json ?? {}, send); }
            if (parts[1] === "_count") { if (!indices.has(index)) return fail(404, notFound(index)); return send(200, { count: [...indices.get(index).docs].filter(([id, d]) => matches(json?.query, id, d)).length }); }
            if (parts[1] === "_doc") {
                const id = parts[2];
                if (req.method === "GET") {
                    const d = indices.get(index)?.docs.get(id);
                    if (!indices.has(index)) return fail(404, notFound(index));
                    if (!d) return send(404, { _index: index, _id: id, found: false });
                    return send(200, { _index: index, _id: id, _version: d.version, _seq_no: d.seq, _primary_term: d.term, found: true, _source: d.source });
                }
                if (req.method === "DELETE") {
                    const ok = indices.get(index)?.docs.delete(id);
                    return send(ok ? 200 : 404, { _index: index, _id: id, result: ok ? "deleted" : "not_found" });
                }
                const q = url.searchParams, had = indices.get(index)?.docs.get(id);
                if (q.get("if_seq_no") != null && (!had || String(had.seq) !== q.get("if_seq_no") || String(had.term) !== q.get("if_primary_term")))
                    return fail(409, err("version_conflict_engine_exception", `[${id}]: version conflict, required seqNo [${q.get("if_seq_no")}], primary term [${q.get("if_primary_term")}], current document has seqNo [${had?.seq}]`));
                const r = put(index, id ?? `auto${seq}`, json, q.get("op_type") === "create");
                if (r.error) return fail(r.status, r.error);
                return send(r.status, { _index: index, _id: id, _version: r.entry.version, result: r.result, _seq_no: r.entry.seq, _primary_term: 1 });
            }
            if (parts[1] === "_update") {
                const had = indices.get(index)?.docs.get(parts[2]);
                if (!had && !json?.doc_as_upsert) return fail(404, err("document_missing_exception", `[${parts[2]}]: document missing`));
                const r = put(index, parts[2], { ...had?.source, ...json.doc }, false);
                if (r.error) return fail(r.status, r.error);
                return send(200, { _index: index, _id: parts[2], _version: r.entry.version, result: r.result });
            }
            fail(400, err("illegal_argument_exception", `no handler found for uri [${req.url}] and method [${req.method}]`));
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { ELASTICSEARCH_API_URL: `http://127.0.0.1:${port}`, ELASTICSEARCH_API_KEY: KEY },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.bulk) return "the Elasticsearch stand-in got no bulk request";
            if (!stats.rejected || !stats.resent) return "the 429 on one bulk item was not sent again";
            if (stats.closed < 2) return "the points in time were not closed on both products";
            if (pits.size) return `${pits.size} point in time left open`;
            return null;
        },
    };
}
