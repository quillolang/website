// A HashiCorp Vault for the vault plugin's test, written from Vault's HTTP API documentation: "KV
// secrets engine (v2)", "Transit", "AppRole auth", "/sys/leases", "/sys/health". X-Vault-Token on
// each request; POST /v1/auth/approle/login gives a client_token, with a lease_duration; the first
// token is revoked once, to see a sign-in again. KV: data, delete, undelete, destroy, metadata and
// list=true, versions kept, `options.cas` checked ("check-and-set parameter did not match the current
// version"), a deleted version a 404 with its metadata in `data`, PATCH needing
// application/merge-patch+json. Transit really encrypts, with AES-256-GCM under per-version keys, so
// a changed ciphertext fails, batch_input answers batch_results with an error per item, and rotate
// and rewrap work. database/creds/readonly gives a lease, with renew, lookup and revoke. Errors are
// { errors: [...] } with Vault's codes.
import { createServer } from "node:http";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";

const ROLE = "standin-role-id", SECRET = "standin-secret-id";

export async function start({ port }) {
    const stats = { logins: 0, revokedOnce: false, kv: 0, transit: 0, leases: 0 };
    const tokens = new Set();
    const kv = new Map(), keys = new Map(), leases = new Map();
    const stamp = () => new Date().toISOString();
    const enc = (k, version, text) => { const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", k.versions[version - 1], iv); const body = Buffer.concat([c.update(text), c.final()]); return `vault:v${version}:` + Buffer.concat([iv, c.getAuthTag(), body]).toString("base64"); };
    const dec = (k, text) => {
        const m = /^vault:v(\d+):(.*)$/.exec(text);
        if (!m) throw { code: 400, msg: "invalid ciphertext: no prefix" };
        const key = k.versions[Number(m[1]) - 1];
        const b = Buffer.from(m[2], "base64");
        try { const d = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]); }
        catch { throw { code: 400, msg: "cipher: message authentication failed" }; }
    };
    const secret = (p) => { if (!kv.has(p)) kv.set(p, { versions: [], current: 0 }); return kv.get(p); };
    const meta = (s, n) => { const v = s.versions[n - 1]; return { created_time: v.created, custom_metadata: null, deletion_time: v.deleted ?? "", destroyed: v.destroyed, version: n }; };
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const url = new URL(req.url, "http://x");
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(v === undefined ? "" : JSON.stringify(v) + "\n"); };
            const fail = (code, ...errors) => send(code, { errors });
            const wrap = (data, extra = {}) => send(200, { request_id: randomUUID(), lease_id: "", renewable: false, lease_duration: 0, data, wrap_info: null, warnings: null, auth: null, ...extra });
            const path = decodeURIComponent(url.pathname).replace(/^\/v1\//, "");
            let json = {};
            if (body) { try { json = JSON.parse(body); } catch { return fail(400, "failed to parse JSON input"); } }
            if (path === "sys/health") return send(200, { initialized: true, sealed: false, standby: false, performance_standby: false, version: "1.15.2", cluster_name: "standin" });
            if (path === "auth/approle/login") {
                if (json.role_id !== ROLE) return fail(400, "invalid role ID");
                if (json.secret_id !== SECRET) return fail(400, "invalid secret id");
                const t = "hvs." + randomBytes(10).toString("hex");
                tokens.add(t); stats.logins++;
                return send(200, { auth: { client_token: t, accessor: "a", policies: ["default"], lease_duration: 3600, renewable: true } });
            }
            const tok = req.headers["x-vault-token"];
            if (!tokens.has(tok)) return fail(403, "permission denied");
            if (!stats.revokedOnce && stats.kv === 2) { stats.revokedOnce = true; tokens.delete(tok); return fail(403, "permission denied"); }
            if (path.startsWith("secret/data/forbidden")) return fail(403, "1 error occurred:\n\t* permission denied\n\n");
            try {
                let m;
                if ((m = /^secret\/data\/(.+)$/.exec(path))) {
                    stats.kv++;
                    const p = m[1], s = kv.get(p);
                    if (req.method === "GET") {
                        if (!s || !s.current) return send(404, { errors: [] });
                        const n = Number(url.searchParams.get("version") ?? s.current), v = s.versions[n - 1];
                        if (!v) return send(404, { errors: [] });
                        if (v.deleted || v.destroyed) return send(404, { request_id: "x", data: { data: null, metadata: meta(s, n) } });
                        return wrap({ data: v.data, metadata: meta(s, n) });
                    }
                    if (req.method === "DELETE") { const v = s?.versions[s.current - 1]; if (v) v.deleted = stamp(); return send(204); }
                    const t = secret(p);
                    if (req.method === "PATCH") {
                        if (req.headers["content-type"] !== "application/merge-patch+json") return fail(415, "PATCH requires application/merge-patch+json");
                        if (!t.current) return fail(404, "no such secret");
                        const data = { ...t.versions[t.current - 1].data, ...json.data };
                        for (const [k, v] of Object.entries(json.data)) if (v === null) delete data[k];
                        t.versions.push({ data, created: stamp(), destroyed: false }); t.current++;
                        return wrap({ ...meta(t, t.current) });
                    }
                    if (json.options?.cas !== undefined && json.options.cas !== t.current) return fail(400, `check-and-set parameter did not match the current version`);
                    if (!json.data) return fail(400, "no data provided");
                    t.versions.push({ data: json.data, created: stamp(), destroyed: false }); t.current++;
                    return wrap({ ...meta(t, t.current) });
                }
                if ((m = /^secret\/(delete|undelete|destroy)\/(.+)$/.exec(path))) {
                    const s = kv.get(m[2]);
                    for (const n of json.versions ?? []) { const v = s?.versions[n - 1]; if (!v) continue; if (m[1] === "delete") v.deleted = stamp(); if (m[1] === "undelete") delete v.deleted; if (m[1] === "destroy") { v.destroyed = true; v.data = null; } }
                    return send(204);
                }
                if ((m = /^secret\/metadata(?:\/(.*))?$/.exec(path))) {
                    const p = (m[1] ?? "").replace(/\/$/, "");
                    if (url.searchParams.get("list") === "true") {
                        const pre = p ? p + "/" : "";
                        const names = [...new Set([...kv.keys()].filter((k) => k.startsWith(pre)).map((k) => { const r = k.slice(pre.length), i = r.indexOf("/"); return i < 0 ? r : r.slice(0, i + 1); }))].sort();
                        return names.length ? wrap({ keys: names }) : send(404, { errors: [] });
                    }
                    const s = kv.get(p);
                    if (!s) return send(404, { errors: [] });
                    return wrap({ cas_required: false, current_version: s.current, oldest_version: 0, versions: Object.fromEntries(s.versions.map((v, i) => [String(i + 1), { created_time: v.created, deletion_time: v.deleted ?? "", destroyed: v.destroyed }])) });
                }
                if ((m = /^transit\/(encrypt|decrypt|rewrap|keys)\/([^/]+)(\/rotate)?$/.exec(path))) {
                    stats.transit++;
                    const name = m[2];
                    if (m[2] === "nothing" && m[1] === "encrypt") return fail(403, "1 error occurred:\n\t* permission denied\n\n");
                    if (!keys.has(name)) keys.set(name, { versions: [randomBytes(32)] });
                    const k = keys.get(name);
                    if (m[1] === "keys") { k.versions.push(randomBytes(32)); return send(204); }
                    const one = (item) => {
                        if (m[1] === "encrypt") {
                            if (typeof item.plaintext !== "string" || (item.plaintext && Buffer.from(item.plaintext, "base64").toString("base64") !== item.plaintext)) throw { code: 400, msg: "illegal base64 data at input byte 0" };
                            return { ciphertext: enc(k, k.versions.length, Buffer.from(item.plaintext, "base64")), key_version: k.versions.length };
                        }
                        const p = dec(k, item.ciphertext);
                        if (m[1] === "rewrap") return { ciphertext: enc(k, k.versions.length, p), key_version: k.versions.length };
                        return { plaintext: p.toString("base64") };
                    };
                    if (json.batch_input) return wrap({ batch_results: json.batch_input.map((i) => { try { return one(i); } catch (e) { if (!e.msg) throw e; return { error: e.msg }; } }) });
                    return wrap(one(json));
                }
                if (path === "database/creds/readonly") {
                    const id = `database/creds/readonly/${randomBytes(6).toString("hex")}`;
                    leases.set(id, { ttl: 3600 }); stats.leases++;
                    return wrap({ username: "v-approle-readonly-abc", password: "A1a-" + randomBytes(6).toString("hex") }, { lease_id: id, lease_duration: 3600, renewable: true });
                }
                if (path === "sys/leases/renew") {
                    const l = leases.get(json.lease_id);
                    if (!l) return fail(400, "lease not found");
                    l.ttl = Math.min(json.increment ?? 3600, 3000);
                    return send(200, { lease_id: json.lease_id, renewable: true, lease_duration: l.ttl });
                }
                if (path === "sys/leases/lookup") {
                    const l = leases.get(json.lease_id);
                    if (!l) return fail(400, "invalid lease");
                    return wrap({ id: json.lease_id, issue_time: stamp(), expire_time: new Date(Date.now() + l.ttl * 1000).toISOString(), last_renewal: null, renewable: true, ttl: l.ttl });
                }
                if (path === "sys/leases/revoke") { leases.delete(json.lease_id); return send(204); }
                fail(404);
            } catch (e) {
                if (e.msg) return fail(e.code, e.msg);
                fail(500, String(e));
            }
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { VAULT_API_URL: `http://127.0.0.1:${port}`, VAULT_ROLE_ID: ROLE, VAULT_SECRET_ID: SECRET },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.logins) return "no AppRole sign-in reached the stand-in";
            if (!stats.revokedOnce || stats.logins < 2) return "the revoked token was not replaced by a new sign-in";
            if (!stats.transit || !stats.kv || !stats.leases) return "the stand-in missed KV, transit or leases";
            return null;
        },
    };
}
