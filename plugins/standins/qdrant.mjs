// A Qdrant REST API for the qdrant plugin's test, written from Qdrant's API reference and its
// "Filtering" and "Points" pages: api-key header, answers as { result, status, time } and errors as
// { status: { error }, time }. PUT /collections/:c (409 on a name in use), GET, DELETE, PUT
// .../index, PUT .../points (ids a u64 or UUID, vector size checked with Qdrant's message), POST
// .../points/query with `query`, `filter` (must, should, must_not; key with match.value, match.any
// or range; is_null), `limit`, `offset`, `with_payload`, `score_threshold`, cosine scored; POST
// .../points (by ids), /scroll with next_page_offset, /count, /payload, /delete.
import { createServer } from "node:http";

const KEY = "standin-qdrant-key";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function start({ port }) {
    const stats = { upserts: 0, queries: 0, filtered: 0, scrolls: 0 };
    const cols = new Map();
    const cos = (a, b) => { const d = a.reduce((s, x, i) => s + x * b[i], 0), n = Math.hypot(...a) * Math.hypot(...b); return n ? d / n : 0; };
    function cond(c, p) {
        if (c.must || c.should || c.must_not) return passes(c, p);
        if (c.is_null) return p[c.is_null.key] === null || p[c.is_null.key] === undefined;
        const v = p[c.key];
        if (c.match) {
            if ("value" in c.match) return v === c.match.value;
            if ("any" in c.match) return c.match.any.includes(v);
            if ("except" in c.match) return !c.match.except.includes(v);
            throw new Error("bad match");
        }
        if (c.range) return v !== undefined && (c.range.gte === undefined || v >= c.range.gte) && (c.range.gt === undefined || v > c.range.gt) && (c.range.lte === undefined || v <= c.range.lte) && (c.range.lt === undefined || v < c.range.lt);
        throw new Error("bad condition");
    }
    function passes(f, p) {
        if (!f) return true;
        return (f.must ?? []).every((c) => cond(c, p)) && (f.must_not ?? []).every((c) => !cond(c, p)) && (!f.should?.length || f.should.some((c) => cond(c, p)));
    }
    const order = (a, b) => (typeof a.id === typeof b.id ? (a.id < b.id ? -1 : 1) : typeof a.id === "number" ? -1 : 1);
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const t0 = 0.0001;
            const ok = (result) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ result, status: "ok", time: t0 })); };
            const fail = (code, error) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify({ status: { error }, time: t0 })); };
            if (req.headers["api-key"] !== KEY) { res.writeHead(401, { "content-type": "text/plain" }); return res.end("Invalid api-key"); }
            const url = new URL(req.url, "http://x");
            const p = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
            if (p[0] !== "collections") return fail(404, "Not found");
            let json = null;
            if (body) { try { json = JSON.parse(body); } catch { return fail(400, "Format error in JSON body"); } }
            const name = p[1], col = cols.get(name);
            if (!p[2]) {
                if (req.method === "PUT") {
                    if (col) return fail(409, `Wrong input: Collection \`${name}\` already exists!`);
                    if (!json?.vectors?.size) return fail(422, "Json deserialize error: missing field `vectors`");
                    cols.set(name, { vectors: json.vectors, points: new Map() });
                    return ok(true);
                }
                if (req.method === "DELETE") return ok(cols.delete(name));
                if (!col) return fail(404, `Not found: Collection \`${name}\` doesn't exist!`);
                return ok({ status: "green", optimizer_status: "ok", points_count: col.points.size, indexed_vectors_count: 0, segments_count: 1, config: { params: { vectors: col.vectors } } });
            }
            if (!col) return fail(404, `Not found: Collection \`${name}\` doesn't exist!`);
            const done = () => { if (url.searchParams.get("wait") !== "true") return ok({ operation_id: 1, status: "acknowledged" }); ok({ operation_id: 1, status: "completed" }); };
            if (p[2] === "index") return done();
            if (p[2] === "points" && !p[3] && req.method === "PUT") {
                if (!Array.isArray(json?.points)) return fail(422, "Json deserialize error: missing field `points`");
                for (const pt of json.points) {
                    if (!(Number.isInteger(pt.id) && pt.id >= 0) && !UUID.test(pt.id)) return fail(422, `Format error in JSON body: value ${JSON.stringify(pt.id)} is not a valid point ID`);
                    if (pt.vector.length !== col.vectors.size) return fail(400, `Wrong input: Vector dimension error: expected dim: ${col.vectors.size}, got ${pt.vector.length}`);
                }
                for (const pt of json.points) col.points.set(pt.id, pt);
                stats.upserts++;
                return done();
            }
            const pts = [...col.points.values()];
            const view = (pt, extra = {}) => ({ id: pt.id, ...extra, ...(json.with_payload === false ? {} : { payload: pt.payload ?? {} }), ...(json.with_vector ? { vector: pt.vector } : {}) });
            if (p[2] === "points" && p[3] === "query") {
                if (json.query.length !== col.vectors.size) return fail(400, `Wrong input: Vector dimension error: expected dim: ${col.vectors.size}, got ${json.query.length}`);
                stats.queries++; if (json.filter) stats.filtered++;
                const hits = pts.filter((x) => passes(json.filter, x.payload ?? {})).map((x) => ({ x, score: cos(json.query, x.vector) })).filter((h) => json.score_threshold === undefined || h.score >= json.score_threshold).sort((a, b) => b.score - a.score);
                return ok({ points: hits.slice(json.offset ?? 0, (json.offset ?? 0) + (json.limit ?? 10)).map((h) => view(h.x, { version: 3, score: h.score })) });
            }
            if (p[2] === "points" && !p[3] && req.method === "POST") return ok(json.ids.filter((i) => col.points.has(i)).map((i) => view(col.points.get(i))));
            if (p[3] === "scroll") {
                stats.scrolls++;
                const sorted = pts.filter((x) => passes(json.filter, x.payload ?? {})).sort(order);
                const at = json.offset == null ? 0 : sorted.findIndex((x) => x.id === json.offset);
                const limit = json.limit ?? 10, page = sorted.slice(at, at + limit);
                return ok({ points: page.map((x) => view(x)), next_page_offset: sorted[at + limit]?.id ?? null });
            }
            if (p[3] === "count") return ok({ count: pts.filter((x) => passes(json.filter, x.payload ?? {})).length });
            if (p[3] === "payload") {
                for (const x of pts) if (json.points ? json.points.includes(x.id) : passes(json.filter, x.payload ?? {})) x.payload = { ...x.payload, ...json.payload };
                return done();
            }
            if (p[3] === "delete") {
                for (const x of pts) if (json.points ? json.points.includes(x.id) : passes(json.filter, x.payload ?? {})) col.points.delete(x.id);
                return done();
            }
            fail(404, "Not found");
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { QDRANT_API_URL: `http://127.0.0.1:${port}`, QDRANT_API_KEY: KEY },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.upserts) return "the Qdrant stand-in got no points";
            if (!stats.filtered) return "the Qdrant stand-in got no filtered search";
            if (!stats.scrolls) return "the Qdrant stand-in got no scroll";
            return null;
        },
    };
}
