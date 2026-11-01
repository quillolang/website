// etcd's v3 JSON gateway for the etcd plugin's test, written from etcd's API reference and its
// "gRPC gateway" guide: POST /v3/kv/put, /range, /deleterange, /txn, /v3/lease/grant, /keepalive,
// /timetolive, /revoke and /v3/auth/authenticate. Keys and values in base64, int64 in text, zero
// values left out as proto3 JSON does (so `count` is absent when 0, `succeeded` when false),
// revisions kept per key for reads of the past, limit with `more`, sort_order, keys_only, range_end,
// lease checks ("etcdserver: requested lease not found"), a token in Authorization that expires
// once, and { error, code, message } errors. Keep-alive answers { result: { ID, TTL } } as the
// gateway's stream does, one line, and no TTL for an ended lease.
import { createServer } from "node:http";

const USER = "root", PASS = "standin-etcd-pass";
const d = (s) => Buffer.from(s ?? "", "base64");
const e = (b) => Buffer.from(b).toString("base64");

export async function start({ port }) {
    const stats = { puts: 0, ranges: 0, txns: 0, auths: 0, expired: false, overPrefix: 0 };
    let rev = 1, leaseSeq = 7587873948294732000n, token = null, calls = 0;
    const kv = new Map(), history = [], leases = new Map();
    const header = () => ({ cluster_id: "14841639068965178418", member_id: "10276657743932975437", revision: String(rev), raft_term: "2" });
    const key = (b) => b.toString("latin1");
    const toBuf = (k) => Buffer.from(k, "latin1");
    const asKv = (k, x, keysOnly) => {
        const o = { key: e(toBuf(k)), create_revision: String(x.create), mod_revision: String(x.mod), version: String(x.version) };
        if (!keysOnly) o.value = e(x.value);
        if (x.lease) o.lease = x.lease;
        return o;
    };
    function put(k, value, lease) {
        if (lease && lease !== "0" && !leases.has(lease)) throw { http: 400, code: 5, message: "etcdserver: requested lease not found" };
        const had = kv.get(k);
        rev++;
        const x = { value, create: had?.create ?? rev, mod: rev, version: (had?.version ?? 0) + 1, lease: lease && lease !== "0" ? lease : undefined };
        kv.set(k, x); history.push({ k, rev, x });
        if (x.lease) leases.get(x.lease).keys.add(k);
        return had;
    }
    function del(k) { if (!kv.has(k)) return 0; kv.delete(k); rev++; history.push({ k, rev, x: null }); return 1; }
    function inRange(k, start, end) {
        if (!end.length) return k === key(start);
        const b = toBuf(k);
        if (Buffer.compare(b, start) < 0) return false;
        return (end.length === 1 && end[0] === 0) || Buffer.compare(b, end) < 0;
    }
    function range(r) {
        const start = d(r.key), end = d(r.range_end);
        let list;
        if (r.revision && Number(r.revision) > 0) {
            if (Number(r.revision) > rev) throw { http: 400, code: 11, message: "etcdserver: mvcc: required revision is a future revision" };
            const at = new Map();
            for (const h of history) if (h.rev <= Number(r.revision)) { if (h.x) at.set(h.k, h.x); else at.delete(h.k); }
            list = [...at.entries()];
        } else list = [...kv.entries()];
        list = list.filter(([k]) => inRange(k, start, end)).sort(([a], [b]) => Buffer.compare(toBuf(a), toBuf(b)));
        if (r.sort_order === "DESCEND") list.reverse();
        const total = list.length, limit = Number(r.limit ?? 0);
        const page = limit ? list.slice(0, limit) : list;
        const out = { header: header() };
        if (page.length) out.kvs = page.map(([k, x]) => asKv(k, x, r.keys_only));
        if (limit && total > limit) out.more = true;
        if (total) out.count = String(total);
        return out;
    }
    function cmp(c) {
        const x = kv.get(key(d(c.key)));
        const [have, want] = c.target === "VALUE" ? [x ? x.value.toString("base64") : null, c.value] : c.target === "VERSION" ? [x?.version ?? 0, Number(c.version)] : c.target === "CREATE" ? [x?.create ?? 0, Number(c.create_revision)] : c.target === "MOD" ? [x?.mod ?? 0, Number(c.mod_revision)] : [x?.lease ?? "0", c.lease];
        switch (c.result) { case "EQUAL": return have === want; case "NOT_EQUAL": return have !== want; case "GREATER": return have > want; case "LESS": return have < want; default: throw { http: 400, code: 3, message: "bad compare" }; }
    }
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (x) => (body += x));
        req.on("end", () => {
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            const fail = (http, code, message) => send(http, { error: message, code, message });
            let j;
            try { j = JSON.parse(body || "{}"); } catch { return fail(400, 3, "invalid character in JSON"); }
            const p = new URL(req.url, "http://x").pathname;
            if (p === "/v3/auth/authenticate") {
                if (j.name !== USER || j.password !== PASS) return fail(400, 3, "etcdserver: authentication failed, invalid user ID or password");
                stats.auths++; token = "token." + rev + "." + stats.auths;
                return send(200, { header: header(), token });
            }
            if (req.headers.authorization !== token) return fail(401, 16, "etcdserver: invalid auth token");
            calls++;
            if (calls === 12 && !stats.expired) { stats.expired = true; token = null; return fail(401, 16, "etcdserver: invalid auth token"); }
            try {
                switch (p) {
                    case "/v3/kv/put": {
                        stats.puts++;
                        const k = key(d(j.key)), prev = put(k, d(j.value), j.lease);
                        return send(200, { header: header(), ...(j.prev_kv && prev ? { prev_kv: asKv(k, prev) } : {}) });
                    }
                    case "/v3/kv/range": stats.ranges++; return send(200, range(j));
                    case "/v3/kv/deleterange": {
                        const start = d(j.key), end = d(j.range_end); let n = 0;
                        for (const k of [...kv.keys()]) if (inRange(k, start, end)) n += del(k);
                        return send(200, { header: header(), ...(n ? { deleted: String(n) } : {}) });
                    }
                    case "/v3/kv/txn": {
                        stats.txns++;
                        const ok = (j.compare ?? []).every(cmp);
                        const responses = (ok ? j.success ?? [] : j.failure ?? []).map((o) => {
                            if (o.request_put) { put(key(d(o.request_put.key)), d(o.request_put.value), o.request_put.lease); return { response_put: { header: header() } }; }
                            if (o.request_range) return { response_range: range(o.request_range) };
                            if (o.request_delete_range) { const n = del(key(d(o.request_delete_range.key))); return { response_delete_range: { header: header(), ...(n ? { deleted: String(n) } : {}) } }; }
                            throw { http: 400, code: 3, message: "unknown request op" };
                        });
                        return send(200, { header: header(), ...(ok ? { succeeded: true } : {}), ...(responses.length ? { responses } : {}) });
                    }
                    case "/v3/lease/grant": {
                        const id = String(leaseSeq++);
                        leases.set(id, { ttl: Number(j.TTL), keys: new Set() });
                        return send(200, { header: header(), ID: id, TTL: j.TTL });
                    }
                    case "/v3/lease/keepalive": {
                        const l = leases.get(j.ID);
                        return send(200, { result: { header: header(), ID: j.ID, ...(l ? { TTL: String(l.ttl) } : {}) } });
                    }
                    case "/v3/lease/timetolive": case "/v3/kv/lease/timetolive": {
                        const l = leases.get(j.ID);
                        if (!l) return send(200, { header: header(), ID: j.ID, TTL: "-1" });
                        return send(200, { header: header(), ID: j.ID, TTL: String(l.ttl - 1), grantedTTL: String(l.ttl), ...(j.keys ? { keys: [...l.keys].map((k) => e(toBuf(k))) } : {}) });
                    }
                    case "/v3/lease/revoke": {
                        const l = leases.get(j.ID);
                        if (!l) throw { http: 400, code: 5, message: "etcdserver: requested lease not found" };
                        for (const k of l.keys) del(k);
                        leases.delete(j.ID);
                        return send(200, { header: header() });
                    }
                    default: return fail(404, 5, "Not Implemented");
                }
            } catch (x) {
                if (x.http) return fail(x.http, x.code, x.message);
                fail(500, 13, String(x));
            }
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { ETCD_API_URL: `http://127.0.0.1:${port}`, ETCD_USERNAME: USER, ETCD_PASSWORD: PASS },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.auths) return "no sign-in reached the etcd stand-in";
            if (stats.auths < 2) return "the expired token was not replaced";
            if (!stats.txns) return "no transaction reached the etcd stand-in";
            return null;
        },
    };
}
