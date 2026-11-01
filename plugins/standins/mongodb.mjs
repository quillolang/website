// A MongoDB server for the mongodb plugin's test, written from MongoDB's wire protocol
// specification, the BSON specification and the database command reference: the real driver connects
// to this, so it speaks what the driver speaks. Messages are OP_MSG (2013), sections of kind 0 and
// kind 1, and OP_QUERY (2004) answered by OP_REPLY for a legacy first hello. Documents are BSON,
// decoded and encoded here. The handshake is hello / isMaster with maxWireVersion and session
// support; then ping, find and getMore with cursors in batches of two, so that the driver must ask
// again, killCursors, insert, update, delete, aggregate ($match, $group, $sort, $limit, $skip,
// $project, $count), distinct, createIndexes, listIndexes, dropIndexes, listCollections and
// endSessions. Unique indexes are enforced with E11000, and errors have their real codes.
import { createServer } from "node:net";

class ObjectId { constructor(hex) { this.hex = hex; } toString() { return this.hex; } }

// ---- BSON ----
function decodeDoc(b, off = 0, isArray = false) {
    const len = b.readInt32LE(off), end = off + len - 1;
    const out = isArray ? [] : {};
    let i = off + 4;
    while (i < end) {
        const t = b[i++];
        let z = b.indexOf(0, i);
        const key = b.toString("utf8", i, z);
        i = z + 1;
        let v;
        switch (t) {
            case 0x01: v = b.readDoubleLE(i); i += 8; break;
            case 0x02: { const n = b.readInt32LE(i); v = b.toString("utf8", i + 4, i + 4 + n - 1); i += 4 + n; break; }
            case 0x03: { const n = b.readInt32LE(i); v = decodeDoc(b, i); i += n; break; }
            case 0x04: { const n = b.readInt32LE(i); v = decodeDoc(b, i, true); i += n; break; }
            case 0x05: { const n = b.readInt32LE(i); v = { $binary: b.subarray(i + 5, i + 5 + n), subtype: b[i + 4] }; i += 5 + n; break; }
            case 0x07: v = new ObjectId(b.toString("hex", i, i + 12)); i += 12; break;
            case 0x08: v = b[i++] === 1; break;
            case 0x09: v = new Date(Number(b.readBigInt64LE(i))); i += 8; break;
            case 0x0a: v = null; break;
            case 0x10: v = b.readInt32LE(i); i += 4; break;
            case 0x11: v = { $timestamp: b.readBigUInt64LE(i) }; i += 8; break;
            case 0x12: { const n = b.readBigInt64LE(i); v = n >= -9007199254740991n && n <= 9007199254740991n ? Number(n) : n; i += 8; break; }
            default: throw new Error(`BSON type ${t} is not read here`);
        }
        if (isArray) out.push(v); else out[key] = v;
    }
    return out;
}
function encodeDoc(doc) {
    const parts = [];
    const entries = Array.isArray(doc) ? doc.map((v, i) => [String(i), v]) : Object.entries(doc);
    for (const [k, v] of entries) {
        if (v === undefined) continue;
        const key = Buffer.concat([Buffer.from(k), Buffer.from([0])]);
        const put = (t, body) => parts.push(Buffer.from([t]), key, body);
        if (v === null) put(0x0a, Buffer.alloc(0));
        else if (typeof v === "boolean") put(0x08, Buffer.from([v ? 1 : 0]));
        else if (typeof v === "bigint") { const b = Buffer.alloc(8); b.writeBigInt64LE(v); put(0x12, b); }
        else if (typeof v === "number") {
            if (Number.isInteger(v) && Math.abs(v) < 2147483648) { const b = Buffer.alloc(4); b.writeInt32LE(v); put(0x10, b); }
            else if (Number.isInteger(v)) { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(v)); put(0x12, b); }
            else { const b = Buffer.alloc(8); b.writeDoubleLE(v); put(0x01, b); }
        } else if (typeof v === "string") { const s = Buffer.from(v), n = Buffer.alloc(4); n.writeInt32LE(s.length + 1); put(0x02, Buffer.concat([n, s, Buffer.from([0])])); }
        else if (v instanceof ObjectId) put(0x07, Buffer.from(v.hex, "hex"));
        else if (v instanceof Date) { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(v.getTime())); put(0x09, b); }
        else if (Array.isArray(v)) put(0x04, encodeDoc(v));
        else put(0x03, encodeDoc(v));
    }
    const body = Buffer.concat(parts), head = Buffer.alloc(4);
    head.writeInt32LE(body.length + 5);
    return Buffer.concat([head, body, Buffer.from([0])]);
}

// ---- Queries ----
const key = (v) => (v instanceof ObjectId ? `oid:${v.hex}` : v instanceof Date ? `date:${v.getTime()}` : typeof v === "object" ? JSON.stringify(v) : typeof v === "bigint" ? `n:${v}` : `${typeof v}:${v}`);
const same = (a, b) => key(a) === key(b);
const rank = (v) => (v instanceof Date ? v.getTime() : v);
const get = (doc, path) => path.split(".").reduce((o, p) => (o == null ? undefined : o[p]), doc);
function bad(code, codeName, errmsg) { const e = new Error(errmsg); Object.assign(e, { mongo: { ok: 0, errmsg, code, codeName } }); return e; }
function opMatch(have, ops) {
    return Object.entries(ops).every(([op, x]) => {
        const list = Array.isArray(have) ? have : [have];
        switch (op) {
            case "$eq": return list.some((h) => same(h, x));
            case "$ne": return !list.some((h) => same(h, x));
            case "$gt": return have !== undefined && list.some((h) => rank(h) > rank(x));
            case "$gte": return have !== undefined && list.some((h) => rank(h) >= rank(x));
            case "$lt": return have !== undefined && list.some((h) => rank(h) < rank(x));
            case "$lte": return have !== undefined && list.some((h) => rank(h) <= rank(x));
            case "$in": return list.some((h) => x.some((y) => same(h, y)));
            case "$nin": return !list.some((h) => x.some((y) => same(h, y)));
            case "$exists": return (have !== undefined) === !!x;
            default: throw bad(2, "BadValue", `unknown operator: ${op}`);
        }
    });
}
function matches(doc, q) {
    return Object.entries(q ?? {}).every(([k, v]) => {
        if (k === "$and") return v.every((c) => matches(doc, c));
        if (k === "$or") return v.some((c) => matches(doc, c));
        const have = get(doc, k);
        if (v && typeof v === "object" && !(v instanceof ObjectId) && !(v instanceof Date) && !Array.isArray(v) && Object.keys(v).some((x) => x.startsWith("$"))) return opMatch(have, v);
        return Array.isArray(have) ? have.some((h) => same(h, v)) : same(have ?? null, v);
    });
}
function sortBy(rows, spec) {
    const keys = Object.entries(spec ?? {});
    return [...rows].sort((a, b) => { for (const [k, d] of keys) { const x = rank(get(a, k)), y = rank(get(b, k)); if (x < y) return -d; if (x > y) return d; } return 0; });
}
function project(doc, spec) {
    if (!spec || !Object.keys(spec).length) return doc;
    const out = {};
    if (spec._id !== 0 && "_id" in doc) out._id = doc._id;
    for (const [k, v] of Object.entries(spec)) if (v && k !== "_id" && k in doc) out[k] = doc[k];
    return out;
}
function accumulate(rows, spec) {
    const out = {};
    for (const [name, acc] of Object.entries(spec)) {
        if (name === "_id") continue;
        const [op, arg] = Object.entries(acc)[0];
        const vals = rows.map((r) => (typeof arg === "string" && arg.startsWith("$") ? get(r, arg.slice(1)) : arg));
        if (op === "$sum") out[name] = vals.reduce((a, b) => a + (b ?? 0), 0);
        else if (op === "$avg") out[name] = vals.reduce((a, b) => a + b, 0) / vals.length;
        else if (op === "$max") out[name] = vals.reduce((a, b) => (b > a ? b : a));
        else if (op === "$min") out[name] = vals.reduce((a, b) => (b < a ? b : a));
        else throw bad(15952, "Location15952", `unknown group operator '${op}'`);
    }
    return out;
}
function pipeline(rows, stages) {
    for (const s of stages) {
        const [op, arg] = Object.entries(s)[0];
        if (op === "$match") rows = rows.filter((r) => matches(r, arg));
        else if (op === "$sort") rows = sortBy(rows, arg);
        else if (op === "$limit") rows = rows.slice(0, arg);
        else if (op === "$skip") rows = rows.slice(arg);
        else if (op === "$project") rows = rows.map((r) => project(r, arg));
        else if (op === "$count") rows = [{ [arg]: rows.length }];
        else if (op === "$group") {
            const groups = new Map();
            for (const r of rows) {
                const id = typeof arg._id === "string" && arg._id.startsWith("$") ? get(r, arg._id.slice(1)) ?? null : arg._id;
                const k = key(id);
                if (!groups.has(k)) groups.set(k, { id, rows: [] });
                groups.get(k).rows.push(r);
            }
            rows = [...groups.values()].map((g) => ({ _id: g.id, ...accumulate(g.rows, arg) }));
        } else throw bad(40324, "Location40324", `Unrecognized pipeline stage name: '${op}'`);
    }
    return rows;
}
function applyUpdate(doc, u) {
    for (const [op, fields] of Object.entries(u)) {
        for (const [k, v] of Object.entries(fields)) {
            if (op === "$set") doc[k] = v;
            else if (op === "$inc") doc[k] = (doc[k] ?? 0) + v;
            else if (op === "$unset") delete doc[k];
            else if (op === "$push") (doc[k] ??= []).push(v);
            else throw bad(9, "FailedToParse", `Unknown modifier: ${op}`);
        }
    }
}

export async function start({ port }) {
    const stats = { hellos: 0, opMsg: 0, opQuery: 0, getMores: 0, inserts: 0, kind1: 0, killed: 0 };
    const dbs = new Map();
    const collOf = (db, name) => {
        const k = `${db}.${name}`;
        if (!dbs.has(k)) dbs.set(k, { db, name, docs: [], indexes: [{ v: 2, key: { _id: 1 }, name: "_id_" }] });
        return dbs.get(k);
    };
    const cursors = new Map();
    let nextCursor = 1000n, nextOid = 1;
    const BATCH = 2;
    function batch(ns, rows, field) {
        const first = rows.slice(0, BATCH), rest = rows.slice(BATCH);
        let id = 0n;
        if (rest.length) { id = nextCursor++; cursors.set(id, { ns, rest }); }
        return { cursor: { [field]: first, id, ns }, ok: 1 };
    }
    const duplicate = (c, d) => {
        for (const ix of c.indexes) {
            const isId = ix.name === "_id_";
            if (!isId && !ix.unique) continue;
            const f = Object.keys(ix.key);
            const twin = c.docs.find((x) => x !== d && f.every((k) => same(get(x, k), get(d, k))));
            if (twin) return { code: 11000, errmsg: `E11000 duplicate key error collection: ${c.db}.${c.name} index: ${ix.name} dup key: { ${f.map((k) => `${k}: ${JSON.stringify(get(d, k))}`).join(", ")} }`, keyPattern: ix.key };
        }
        return null;
    };
    function command(cmd) {
        const name = Object.keys(cmd)[0], db = cmd.$db;
        const lower = name.toLowerCase();
        if (lower === "hello" || lower === "ismaster") {
            stats.hellos++;
            return { helloOk: true, ismaster: true, isWritablePrimary: true, maxBsonObjectSize: 16777216, maxMessageSizeBytes: 48000000, maxWriteBatchSize: 100000, localTime: new Date(), logicalSessionTimeoutMinutes: 30, connectionId: 1, minWireVersion: 0, maxWireVersion: 21, readOnly: false, ok: 1 };
        }
        if (lower === "ping" || lower === "endsessions") return { ok: 1 };
        if (lower === "killcursors") { for (const c of cmd.cursors ?? []) { cursors.delete(BigInt(c)); stats.killed++; } return { cursorsKilled: cmd.cursors, ok: 1 }; }
        if (lower === "getmore") {
            stats.getMores++;
            const id = BigInt(cmd.getMore), c = cursors.get(id);
            if (!c) throw bad(43, "CursorNotFound", `cursor id ${id} not found`);
            const size = cmd.batchSize ?? BATCH;
            const next = c.rest.slice(0, Math.min(size, BATCH)); c.rest = c.rest.slice(next.length);
            if (!c.rest.length) cursors.delete(id);
            return { cursor: { nextBatch: next, id: c.rest.length ? id : 0n, ns: c.ns }, ok: 1 };
        }
        if (lower === "listcollections") {
            const rows = [...dbs.values()].filter((c) => c.db === db).map((c) => ({ name: c.name, type: "collection", options: {}, info: { readOnly: false } }));
            return batch(`${db}.$cmd.listCollections`, rows, "firstBatch");
        }
        const c = collOf(db, cmd[name]);
        const ns = `${db}.${c.name}`;
        switch (lower) {
            case "find": {
                let rows = c.docs.filter((d) => matches(d, cmd.filter));
                rows = sortBy(rows, cmd.sort).slice(cmd.skip ?? 0);
                if (cmd.limit) rows = rows.slice(0, cmd.limit);
                rows = rows.map((d) => project(d, cmd.projection));
                if (cmd.singleBatch) return { cursor: { firstBatch: rows.slice(0, 1), id: 0n, ns }, ok: 1 };
                return batch(ns, rows, "firstBatch");
            }
            case "insert": {
                stats.inserts++;
                const writeErrors = []; let n = 0;
                for (const [i, d] of cmd.documents.entries()) {
                    const doc = { _id: new ObjectId((nextOid++).toString(16).padStart(24, "0")), ...d };
                    c.docs.push(doc);
                    const dup = duplicate(c, doc);
                    if (dup) { c.docs.pop(); writeErrors.push({ index: i, ...dup }); if (cmd.ordered !== false) break; } else n++;
                }
                return { n, ok: 1, ...(writeErrors.length ? { writeErrors } : {}) };
            }
            case "update": {
                let n = 0, nModified = 0; const upserted = [];
                for (const [i, u] of cmd.updates.entries()) {
                    const hit = c.docs.filter((d) => matches(d, u.q)).slice(0, u.multi ? undefined : 1);
                    for (const d of hit) {
                        n++;
                        if (Object.keys(u.u)[0]?.startsWith("$")) applyUpdate(d, u.u);
                        else { const id = d._id; for (const k of Object.keys(d)) delete d[k]; Object.assign(d, { _id: id }, u.u); }
                        nModified++;
                    }
                    if (!hit.length && u.upsert) {
                        const d = { _id: new ObjectId((nextOid++).toString(16).padStart(24, "0")) };
                        for (const [k, v] of Object.entries(u.q)) if (!(v && typeof v === "object")) d[k] = v;
                        applyUpdate(d, u.u);
                        c.docs.push(d); n++;
                        upserted.push({ index: i, _id: d._id });
                    }
                }
                return { n, nModified, ...(upserted.length ? { upserted } : {}), ok: 1 };
            }
            case "delete": {
                let n = 0;
                for (const d of cmd.deletes) {
                    const hit = c.docs.filter((x) => matches(x, d.q)).slice(0, d.limit === 1 ? 1 : undefined);
                    c.docs = c.docs.filter((x) => !hit.includes(x));
                    n += hit.length;
                }
                return { n, ok: 1 };
            }
            case "aggregate": return batch(ns, pipeline(c.docs, cmd.pipeline), "firstBatch");
            case "distinct": {
                const seen = new Map();
                for (const d of c.docs.filter((x) => matches(x, cmd.query))) { const v = get(d, cmd.key); for (const x of Array.isArray(v) ? v : [v]) seen.set(key(x), x); }
                return { values: [...seen.values()], ok: 1 };
            }
            case "createindexes": {
                for (const i of cmd.indexes) if (!c.indexes.some((x) => x.name === i.name)) c.indexes.push({ v: 2, ...i });
                return { numIndexesBefore: 1, numIndexesAfter: c.indexes.length, createdCollectionAutomatically: false, ok: 1 };
            }
            case "listindexes": return batch(ns, c.indexes, "firstBatch");
            case "dropindexes": {
                if (!c.indexes.some((x) => x.name === cmd.index)) throw bad(27, "IndexNotFound", `index not found with name [${cmd.index}]`);
                c.indexes = c.indexes.filter((x) => x.name !== cmd.index);
                return { nIndexesWas: c.indexes.length + 1, ok: 1 };
            }
            default: throw bad(59, "CommandNotFound", `no such command: '${name}'`);
        }
    }
    const run = (cmd) => { try { return command(cmd); } catch (e) { if (e.mongo) return e.mongo; return { ok: 0, errmsg: String(e), code: 1, codeName: "InternalError" }; } };
    let reqId = 1;
    const message = (opCode, responseTo, body) => { const h = Buffer.alloc(16); h.writeInt32LE(16 + body.length, 0); h.writeInt32LE(reqId++, 4); h.writeInt32LE(responseTo, 8); h.writeInt32LE(opCode, 12); return Buffer.concat([h, body]); };
    const server = createServer((sock) => {
        let buf = Buffer.alloc(0);
        sock.on("error", () => {});
        sock.on("data", (d) => {
            buf = Buffer.concat([buf, d]);
            while (buf.length >= 4 && buf.length >= buf.readInt32LE(0)) {
                const len = buf.readInt32LE(0), m = buf.subarray(0, len);
                buf = buf.subarray(len);
                const id = m.readInt32LE(4), op = m.readInt32LE(12);
                if (op === 2013) {
                    stats.opMsg++;
                    const flags = m.readUInt32LE(16);
                    const end = len - (flags & 1 ? 4 : 0);
                    let i = 20, cmd = null;
                    const extra = {};
                    while (i < end) {
                        const kind = m[i++];
                        if (kind === 0) { const n = m.readInt32LE(i); cmd = decodeDoc(m, i); i += n; }
                        else {
                            stats.kind1++;
                            const size = m.readInt32LE(i), stop = i + size;
                            let j = i + 4, z = m.indexOf(0, j);
                            const ident = m.toString("utf8", j, z);
                            j = z + 1;
                            const docs = [];
                            while (j < stop) { const n = m.readInt32LE(j); docs.push(decodeDoc(m, j)); j += n; }
                            extra[ident] = docs;
                            i = stop;
                        }
                    }
                    const flagsOut = Buffer.alloc(4);
                    const reply = run({ ...cmd, ...extra });
                    if (flags & 2) continue; // moreToCome: no answer is wanted
                    sock.write(message(2013, id, Buffer.concat([flagsOut, Buffer.from([0]), encodeDoc(reply)])));
                } else if (op === 2004) {
                    stats.opQuery++;
                    let i = 20; i = m.indexOf(0, i) + 1; i += 8;
                    const q = decodeDoc(m, i);
                    const head = Buffer.alloc(20); head.writeInt32LE(8, 0); head.writeInt32LE(1, 16);
                    sock.write(message(1, id, Buffer.concat([head, encodeDoc(run({ ...q, $db: "admin" }))])));
                } else sock.destroy();
            }
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { MONGODB_URI: `mongodb://127.0.0.1:${port}/?directConnection=true`, MONGODB_DATABASE: "shop" },
        close() { server.close(); },
        check() {
            if (!stats.hellos) return "no hello reached the MongoDB stand-in";
            if (!stats.opMsg) return "no OP_MSG reached the MongoDB stand-in";
            if (!stats.getMores) return "no getMore: the cursors were not followed";
            if (!stats.inserts) return "no insert reached the MongoDB stand-in";
            return null;
        },
    };
}
