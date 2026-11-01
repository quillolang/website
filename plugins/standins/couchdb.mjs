// An Apache CouchDB API for the couchdb plugin's test, written from CouchDB's API reference
// ("Databases", "Documents", "_bulk_docs", "_find", "_index", "_changes") and its "Replication and
// conflict model". Basic auth. Documents keep a tree of revisions (`n-md5`): PUT without the
// current _rev is 409 { error: "conflict", reason: "Document update conflict." }, GET ?rev= reads an
// old one, ?conflicts=true lists the losers, the winner being the highest generation and then the
// highest rev text, as CouchDB picks it. _bulk_docs answers each document on its own and takes
// new_edits:false. _find takes $eq, $gte, $gt, $lte, $lt, sort, fields, limit, and bookmarks ("nil"
// at the end), with 400 invalid_operator; _changes takes since, limit, include_docs, longpoll
// and filter=_selector, with opaque seq texts.
import { createServer } from "node:http";
import { createHash } from "node:crypto";

const USER = "admin", PASS = "standin-couch-pass";
const rid = (doc, gen) => `${gen}-${createHash("md5").update(JSON.stringify(doc) + gen).digest("hex")}`;
const gen = (r) => Number(r.split("-")[0]);

export async function start({ port }) {
    const stats = { puts: 0, conflicts: 0, bulk: 0, finds: 0, changes: 0, bookmarks: 0 };
    const dbs = new Map();
    const newDb = () => ({ docs: new Map(), seq: 0, log: [], indexes: new Map() });
    const leaves = (e) => [...e.revs.entries()].filter(([, v]) => v.leaf).map(([r, v]) => ({ rev: r, ...v }));
    function winner(e) {
        const all = leaves(e).filter((l) => !l.deleted);
        const pool = all.length ? all : leaves(e);
        pool.sort((a, b) => gen(b.rev) - gen(a.rev) || (a.rev < b.rev ? 1 : -1));
        return pool[0];
    }
    function logChange(db, id) {
        db.seq++;
        db.log = db.log.filter((c) => c.id !== id);
        db.log.push({ id, seq: db.seq });
    }
    function write(db, id, doc, rev) {
        const e = db.docs.get(id) ?? { revs: new Map() };
        const w = db.docs.has(id) ? winner(e) : null;
        const open = w && !w.deleted;
        if (open ? rev !== w.rev && !leaves(e).some((l) => l.rev === rev) : false) return null;
        if (!open && w && rev && rev !== w.rev) return null;
        const body = { ...doc }; delete body._id; delete body._rev;
        const deleted = !!body._deleted; delete body._deleted;
        const parent = rev ? e.revs.get(rev) : null;
        const g = rev ? gen(rev) + 1 : (w ? gen(w.rev) + 1 : 1);
        const nr = rid(body, g);
        if (parent) parent.leaf = false;
        e.revs.set(nr, { body, deleted, leaf: true });
        db.docs.set(id, e);
        logChange(db, id);
        return nr;
    }
    const view = (id, rev, body, extra = {}) => ({ _id: id, _rev: rev, ...body, ...extra });
    function cond(sel, doc) {
        for (const [k, v] of Object.entries(sel)) {
            if (k === "$and") { if (!v.every((x) => cond(x, doc))) return false; continue; }
            const have = doc[k];
            if (v && typeof v === "object") {
                for (const [op, x] of Object.entries(v)) {
                    if (!["$eq", "$gte", "$gt", "$lte", "$lt", "$ne"].includes(op)) throw { status: 400, error: "invalid_operator", reason: `Invalid operator: ${op}` };
                    if (have === undefined) return false;
                    if (!({ $eq: have === x, $gte: have >= x, $gt: have > x, $lte: have <= x, $lt: have < x, $ne: have !== x }[op])) return false;
                }
            } else if (have !== v) return false;
        }
        return true;
    }

    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const url = new URL(req.url, "http://x");
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v) + "\n"); };
            const fail = (code, error, reason) => send(code, { error, reason });
            if (req.headers.authorization !== "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64")) return fail(401, "unauthorized", "Name or password is incorrect.");
            const raw = url.pathname.split("/").filter(Boolean);
            const name = decodeURIComponent(raw[0] ?? "");
            let json = null;
            if (body) { try { json = JSON.parse(body); } catch { return fail(400, "bad_request", "invalid UTF-8 JSON"); } }
            if (!name) return send(200, { couchdb: "Welcome", version: "3.3.3" });
            if (raw.length === 1 && req.method === "PUT") {
                if (!/^[a-z][a-z0-9_$()+/-]*$/.test(name)) return fail(400, "illegal_database_name", "Name: '" + name + "'. Only lowercase characters (a-z), digits (0-9), and any of the characters _, $, (, ), +, -, and / are allowed. Must begin with a letter.");
                if (dbs.has(name)) return fail(412, "file_exists", "The database could not be created, the file already exists.");
                dbs.set(name, newDb());
                return send(201, { ok: true });
            }
            const db = dbs.get(name);
            if (!db) return fail(404, "not_found", "Database does not exist.");
            if (raw.length === 1 && req.method === "DELETE") { dbs.delete(name); return send(200, { ok: true }); }
            if (raw.length === 1 && req.method === "POST") {
                const id = json._id ?? createHash("md5").update(String(Math.random())).digest("hex");
                const rev = write(db, id, json, null);
                return send(201, { ok: true, id, rev });
            }
            const second = raw[1];
            if (second === "_bulk_docs") {
                stats.bulk++;
                const out = [];
                for (const d of json.docs) {
                    if (json.new_edits === false) {
                        const e = db.docs.get(d._id) ?? { revs: new Map() };
                        const b = { ...d }; delete b._id; delete b._rev;
                        e.revs.set(d._rev, { body: b, deleted: false, leaf: true });
                        db.docs.set(d._id, e);
                        logChange(db, d._id);
                        continue;
                    }
                    const r = write(db, d._id, d, d._rev ?? null);
                    if (r) out.push({ ok: true, id: d._id, rev: r });
                    else { stats.conflicts++; out.push({ id: d._id, error: "conflict", reason: "Document update conflict." }); }
                }
                return send(201, out);
            }
            if (second === "_index") {
                const n = json.name ?? "auto";
                const had = db.indexes.has(n);
                db.indexes.set(n, json.index.fields);
                return send(200, { result: had ? "exists" : "created", id: `_design/${n}`, name: n });
            }
            if (second === "_find") {
                stats.finds++;
                const live = [];
                for (const [id, e] of db.docs) { const w = winner(e); if (!w.deleted) live.push(view(id, w.rev, w.body)); }
                let rows;
                try { rows = live.filter((d) => cond(json.selector, d)); } catch (e) { if (e.status) return fail(e.status, e.error, e.reason); throw e; }
                for (const s of [...(json.sort ?? [])].reverse()) { const [f, dir] = Object.entries(s)[0]; rows.sort((a, b) => (a[f] === b[f] ? 0 : (a[f] < b[f] ? -1 : 1) * (dir === "desc" ? -1 : 1))); }
                let start = 0;
                if (json.bookmark && json.bookmark !== "nil") { start = Number(Buffer.from(json.bookmark, "base64").toString()); stats.bookmarks++; }
                const limit = json.limit ?? 25;
                const page = rows.slice(start, start + limit).map((d) => (json.fields ? Object.fromEntries(json.fields.map((f) => [f, d[f]])) : d));
                return send(200, { docs: page, bookmark: page.length ? Buffer.from(String(start + page.length)).toString("base64") : "nil", ...(json.sort ? {} : { warning: "No matching index found, create an index to optimize query time." }) });
            }
            if (second === "_changes") {
                stats.changes++;
                const q = url.searchParams;
                const seqText = (n) => `${n}-g1AAAAB${Buffer.from(String(n)).toString("base64url")}`;
                const since = q.get("since") === "now" ? db.seq : Number((q.get("since") ?? "0").split("-")[0]);
                let rows = db.log.filter((c) => c.seq > since);
                if (q.get("filter") === "_selector") rows = rows.filter((c) => { const w = winner(db.docs.get(c.id)); return !w.deleted && cond(json.selector, w.body); });
                const limit = q.get("limit") ? Number(q.get("limit")) : rows.length;
                const page = rows.slice(0, limit);
                const results = page.map((c) => {
                    const e = db.docs.get(c.id), w = winner(e);
                    return { seq: seqText(c.seq), id: c.id, changes: [{ rev: w.rev }], ...(w.deleted ? { deleted: true } : {}), ...(q.get("include_docs") === "true" ? { doc: view(c.id, w.rev, w.body) } : {}) };
                });
                return send(200, { results, last_seq: seqText(page.at(-1)?.seq ?? since), pending: rows.length - page.length });
            }
            const id = raw.slice(1).map(decodeURIComponent).join("/");
            const e = db.docs.get(id);
            if (req.method === "GET") {
                if (!e) return fail(404, "not_found", "missing");
                const r = url.searchParams.get("rev");
                if (r) { const v = e.revs.get(r); return v ? send(200, view(id, r, v.body)) : fail(404, "not_found", "missing"); }
                const w = winner(e);
                if (w.deleted) return fail(404, "not_found", "deleted");
                const losers = leaves(e).filter((l) => l.rev !== w.rev && !l.deleted).map((l) => l.rev);
                return send(200, view(id, w.rev, w.body, url.searchParams.get("conflicts") === "true" && losers.length ? { _conflicts: losers } : {}));
            }
            if (req.method === "PUT") {
                stats.puts++;
                const rev = write(db, id, json, json._rev ?? null);
                if (!rev) { stats.conflicts++; return fail(409, "conflict", "Document update conflict."); }
                return send(201, { ok: true, id, rev });
            }
            if (req.method === "DELETE") {
                if (!e || winner(e).deleted) return fail(404, "not_found", "missing");
                const rev = write(db, id, { _deleted: true }, url.searchParams.get("rev"));
                if (!rev) { stats.conflicts++; return fail(409, "conflict", "Document update conflict."); }
                return send(200, { ok: true, id, rev });
            }
            fail(405, "method_not_allowed", "Only GET,PUT,DELETE allowed");
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { COUCHDB_API_URL: `http://127.0.0.1:${port}`, COUCHDB_USER: USER, COUCHDB_PASSWORD: PASS },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.conflicts) return "the CouchDB stand-in refused no write as a conflict";
            if (!stats.bookmarks) return "no Mango page was asked for by its bookmark";
            if (!stats.changes) return "the changes feed was not read";
            return null;
        },
    };
}
