// A Meilisearch API for the meilisearch plugin's test, written from Meilisearch's API reference
// ("Tasks", "Indexes", "Documents", "Settings", "Search", "Keys") and its tenant token guide. Every
// write is asynchronous, as on the real server: it answers 202 with { taskUid, indexUid, status:
// "enqueued", type, enqueuedAt }, and GET /tasks/:uid goes through enqueued and processing to
// succeeded or failed with { error: { message, code, type, link } }. Requests need a Bearer key or a
// tenant token: an HS256 JWT signed with the key whose uid is in `apiKeyUid`, `searchRules` applied
// to the search, `exp` honoured. Errors are { message, code, type, link } with the real codes.
import { createServer } from "node:http";
import { createHmac, randomUUID } from "node:crypto";

const MASTER = "standin-meili-master";
const SEARCH_KEY = "standin-meili-search-key", SEARCH_UID = randomUUID();

export async function start({ port }) {
    const stats = { tasksPolled: 0, tenant: 0, forged: 0, failedTasks: 0 };
    const indexes = new Map(), tasks = new Map();
    let nextTask = 0;
    const merr = (message, code, type = "invalid_request") => ({ message, code, type, link: `https://docs.meilisearch.com/errors#${code}` });

    function enqueue(indexUid, type, run) {
        const uid = nextTask++;
        const task = { uid, indexUid, status: "enqueued", type, canceledBy: null, details: {}, error: null, duration: null, enqueuedAt: new Date().toISOString(), startedAt: null, finishedAt: null, polls: 0, run };
        tasks.set(uid, task);
        return { taskUid: uid, indexUid, status: "enqueued", type, enqueuedAt: task.enqueuedAt };
    }
    function advance(task) {
        // Each look moves it on: a task is seen enqueued or processing before it is done.
        task.polls++;
        if (task.status === "enqueued") { task.status = "processing"; task.startedAt = new Date().toISOString(); return; }
        if (task.status === "processing") {
            const e = task.run();
            if (e) { task.status = "failed"; task.error = e; stats.failedTasks++; } else task.status = "succeeded";
            task.finishedAt = new Date().toISOString(); task.duration = "PT0.001S";
        }
    }
    const view = ({ run, polls, ...t }) => t;

    function check(filter, doc) {
        if (!filter) return true;
        return filter.split(/\s+AND\s+/i).every((c) => {
            const m = /^(\w+)\s*(!=|=)\s*(.+)$/.exec(c.trim());
            if (!m) return false;
            const same = String(doc[m[1]]) === m[3].replace(/^["']|["']$/g, "");
            return m[2] === "=" ? same : !same;
        });
    }
    function parseToken(tok) {
        const [h, p, s] = tok.split(".");
        if (!s) return null;
        let claims;
        try { claims = JSON.parse(Buffer.from(p, "base64url")); } catch { return "bad"; }
        if (claims.apiKeyUid !== SEARCH_UID) return "bad";
        const want = createHmac("sha256", SEARCH_KEY).update(`${h}.${p}`).digest("base64url");
        if (s !== want) return "bad";
        if (claims.exp && claims.exp * 1000 < Date.now()) return "bad";
        return claims;
    }

    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const url = new URL(req.url, "http://x");
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            const tok = (req.headers.authorization ?? "").replace(/^Bearer /, "");
            if (!tok) return send(401, merr("The Authorization header is missing. It must use the bearer authorization method.", "missing_authorization_header", "auth"));
            let rules = null;
            if (tok !== MASTER && tok !== SEARCH_KEY) {
                const c = parseToken(tok);
                if (c === "bad" || c === null) { stats.forged++; return send(403, merr("The provided API key is invalid.", "invalid_api_key", "auth")); }
                rules = c.searchRules;
                stats.tenant++;
            }
            let json = null;
            if (body) { try { json = JSON.parse(body); } catch { return send(400, merr("The JSON payload is malformed", "malformed_payload")); } }
            const p = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
            if (rules && !(p[0] === "indexes" && p[2] === "search")) return send(403, merr("The provided API key is invalid.", "invalid_api_key", "auth"));
            if (tok === SEARCH_KEY && p[2] !== "search") return send(403, merr("The provided API key is invalid.", "invalid_api_key", "auth"));
            if (p[0] === "keys") return send(200, { results: [{ name: "search", description: "", key: SEARCH_KEY, uid: SEARCH_UID, actions: ["search"], indexes: ["*"], expiresAt: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }, { name: "admin", key: "other", uid: randomUUID(), actions: ["*"], indexes: ["*"], expiresAt: null }], offset: 0, limit: 100, total: 2 });
            if (p[0] === "tasks") {
                const t = tasks.get(Number(p[1]));
                if (!t) return send(404, merr(`Task \`${p[1]}\` not found.`, "task_not_found"));
                advance(t); stats.tasksPolled++;
                return send(200, view(t));
            }
            if (p[0] !== "indexes") return send(404, merr("Not Found", "not_found"));
            if (!p[1] && req.method === "POST") {
                if (!json?.uid) return send(400, merr("Missing field `uid`", "missing_index_uid"));
                if (!/^[A-Za-z0-9_-]+$/.test(json.uid)) return send(400, merr(`\`${json.uid}\` is not a valid index uid.`, "invalid_index_uid"));
                return send(202, enqueue(json.uid, "indexCreation", () => {
                    if (indexes.has(json.uid)) return merr(`Index \`${json.uid}\` already exists.`, "index_already_exists");
                    indexes.set(json.uid, { primaryKey: json.primaryKey ?? null, docs: new Map(), filterable: [], sortable: [] });
                }));
            }
            const uid = p[1], idx = indexes.get(uid);
            const noIndex = () => merr(`Index \`${uid}\` not found.`, "index_not_found");
            if (!p[2] && req.method === "DELETE") return send(202, enqueue(uid, "indexDeletion", () => (indexes.delete(uid) ? null : noIndex())));
            if (p[2] === "settings" && req.method === "PATCH") return send(202, enqueue(uid, "settingsUpdate", () => { if (!idx) return noIndex(); idx.filterable = json.filterableAttributes ?? idx.filterable; idx.sortable = json.sortableAttributes ?? idx.sortable; }));
            if (p[2] === "documents") {
                if (req.method === "GET" && p[3]) {
                    if (!idx) return send(404, noIndex());
                    const d = idx.docs.get(p[3]);
                    return d ? send(200, d) : send(404, merr(`Document \`${p[3]}\` not found.`, "document_not_found"));
                }
                if (p[3] === "delete-batch" && req.method === "POST") return send(202, enqueue(uid, "documentDeletion", () => { for (const id of json) idx?.docs.delete(String(id)); }));
                if (p[3] === "delete" && req.method === "POST") return send(202, enqueue(uid, "documentDeletion", () => { for (const [id, d] of idx?.docs ?? []) if (check(json.filter, d)) idx.docs.delete(id); }));
                if (req.method === "POST" || req.method === "PUT") {
                    if (!Array.isArray(json)) return send(400, merr("Invalid value type: expected an array", "malformed_payload"));
                    return send(202, enqueue(uid, "documentAdditionOrUpdate", () => {
                        if (!idx) return noIndex();
                        const pk = idx.primaryKey ?? url.searchParams.get("primaryKey") ?? "id";
                        for (const d of json) {
                            const id = d[pk];
                            if (typeof id === "string" ? !/^[A-Za-z0-9_-]+$/.test(id) : !Number.isInteger(id))
                                return merr(`Document identifier \`"${id}"\` is invalid. A document identifier can be of type integer or string, only composed of alphanumeric characters (a-z A-Z 0-9), hyphens (-) and underscores (_).`, "invalid_document_id");
                        }
                        for (const d of json) { const k = String(d[pk]); idx.docs.set(k, req.method === "PUT" ? { ...idx.docs.get(k), ...d } : d); }
                    }));
                }
            }
            if (p[2] === "search" && req.method === "POST") {
                if (!idx) return send(404, noIndex());
                let rule = rules?.[uid] ?? rules?.["*"];
                if (rules && rule === undefined) return send(403, merr("The provided API key is invalid.", "invalid_api_key", "auth"));
                const tenantFilter = rule?.filter;
                if (json.filter) for (const c of json.filter.split(/\s+AND\s+/i)) {
                    const at = /^(\w+)/.exec(c.trim())?.[1];
                    if (!idx.filterable.includes(at)) return send(400, merr(`Index \`${uid}\`: Attribute \`${at}\` is not filterable. Available filterable attributes are: \`${idx.filterable.join(", ")}\`.\n1:${at.length + 1} ${json.filter}`, "invalid_search_filter"));
                }
                const words = String(json.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
                let hits = [...idx.docs.values()].filter((d) => words.every((w) => Object.values(d).some((v) => String(v).toLowerCase().split(/\s+/).includes(w))) && check(json.filter, d) && check(tenantFilter, d));
                for (const s of [...(json.sort ?? [])].reverse()) { const [f, dir] = s.split(":"); hits.sort((a, b) => (dir === "desc" ? b[f] - a[f] : a[f] - b[f])); }
                const facetDistribution = {};
                for (const f of json.facets ?? []) { facetDistribution[f] = {}; for (const h of hits) facetDistribution[f][h[f]] = (facetDistribution[f][h[f]] ?? 0) + 1; }
                const total = hits.length, offset = json.offset ?? 0, limit = json.limit ?? 20;
                return send(200, { hits: hits.slice(offset, offset + limit), query: json.q, processingTimeMs: 1, limit, offset, estimatedTotalHits: total, ...(json.facets ? { facetDistribution, facetStats: {} } : {}) });
            }
            send(404, merr("Not Found", "not_found"));
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { MEILISEARCH_API_URL: `http://127.0.0.1:${port}`, MEILISEARCH_API_KEY: MASTER, MEILISEARCH_SEARCH_KEY: SEARCH_KEY },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.tasksPolled) return "the Meilisearch stand-in saw no task waited on";
            if (!stats.tenant) return "the Meilisearch stand-in saw no tenant token accepted";
            if (!stats.forged) return "the forged token was not tried";
            return null;
        },
    };
}
