// A Consul agent for the consul plugin's test, written from Consul's HTTP API reference ("KV Store",
// "Blocking Queries", "Agent Service", "Agent Check", "Catalog", "Health", "Session"). X-Consul-Token
// is required. /v1/kv: GET with recurse and keys (and separator), a list of entries with Value in
// base64, 404 for none, X-Consul-Index on each; PUT with flags, cas, acquire and release answers true
// or false; DELETE with recurse. Blocking queries wait while the index passed is the current one, up
// to `wait`. Services have TTL checks and registered instances, with health read from them. Sessions
// have create, renew (404 when ended), destroy, with their locks released. One key's index goes
// backwards, as after a restored snapshot.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const TOKEN = "standin-consul-token";

export async function start({ port }) {
    const stats = { blocked: 0, kvReads: 0, locks: 0 };
    const kv = new Map(), services = new Map(), checks = new Map(), sessions = new Map();
    let index = 100;
    const waiters = new Set();
    const wake = () => { for (const w of [...waiters]) w(); };
    const bump = () => { index++; wake(); return index; };
    const entry = (k, e) => ({ LockIndex: e.lockIndex, Key: k, Flags: e.flags, Value: e.value === null ? null : Buffer.from(e.value).toString("base64"), CreateIndex: e.create, ModifyIndex: e.modify, ...(e.session ? { Session: e.session } : {}) });
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const url = new URL(req.url, "http://x");
            const q = url.searchParams, has = (k) => q.has(k);
            const send = (code, v, idx) => { res.writeHead(code, { "content-type": "application/json", ...(idx !== undefined ? { "x-consul-index": String(idx), "x-consul-knownleader": "true", "x-consul-lastcontact": "0" } : {}) }); res.end(v === undefined ? "" : JSON.stringify(v)); };
            const text = (code, t) => { res.writeHead(code, { "content-type": "text/plain" }); res.end(t); };
            if (req.headers["x-consul-token"] !== TOKEN) return text(403, "ACL not found");
            const path = decodeURIComponent(url.pathname);
            const after = (kPath, answer, current) => {
                // A blocking read: hold it while nothing is newer than ?index=.
                const wantIndex = Number(q.get("index") ?? 0);
                if (!has("index") || wantIndex === 0 || current() !== wantIndex) return answer();
                stats.blocked++;
                const ms = Math.min(parseFloat(q.get("wait") ?? "300") * 1000, 8000);
                let done = false;
                const finish = () => { if (done) return; done = true; waiters.delete(check); clearTimeout(t); answer(); };
                const check = () => { if (current() !== wantIndex) finish(); };
                const t = setTimeout(finish, ms);
                waiters.add(check);
            };
            let m;
            if ((m = /^\/v1\/kv\/(.*)$/.exec(path))) {
                const k = m[1];
                if (k.startsWith("secret/")) return text(403, "Permission denied: token lacks 'key:read' on \"secret/key\"");
                if (req.method === "GET") {
                    stats.kvReads++;
                    if (k === "restored") return send(200, [entry(k, { lockIndex: 0, flags: 0, value: "x", create: 5, modify: 5 })], 5);
                    if (has("keys")) {
                        const names = [...kv.keys()].filter((x) => x.startsWith(k)).sort();
                        const sep = q.get("separator");
                        const out = sep ? [...new Set(names.map((n) => { const i = n.indexOf(sep, k.length); return i < 0 ? n : n.slice(0, i + 1); }))] : names;
                        return out.length ? send(200, out, index) : send(404, undefined, index);
                    }
                    if (has("recurse")) {
                        const list = [...kv.entries()].filter(([x]) => x.startsWith(k)).sort(([a], [b]) => (a < b ? -1 : 1));
                        return list.length ? send(200, list.map(([x, e]) => entry(x, e)), index) : send(404, undefined, index);
                    }
                    return after(k, () => {
                        const e = kv.get(k);
                        return e ? send(200, [entry(k, e)], e.modify) : send(404, undefined, index);
                    }, () => kv.get(k)?.modify ?? index);
                }
                if (req.method === "DELETE") {
                    if (has("recurse")) { for (const x of [...kv.keys()]) if (x.startsWith(k)) kv.delete(x); } else kv.delete(k);
                    bump();
                    return send(200, true);
                }
                if (req.method === "PUT") {
                    const had = kv.get(k);
                    if (has("cas") && Number(q.get("cas")) !== (had?.modify ?? 0)) return send(200, false);
                    const sid = q.get("acquire") ?? q.get("release");
                    if (q.has("acquire")) {
                        if (!sessions.has(sid)) return text(500, `invalid session "${sid}"`);
                        stats.locks++;
                        if (had?.session && had.session !== sid) return send(200, false);
                    }
                    if (q.has("release") && had?.session !== sid) return send(200, false);
                    const e = { value: body, flags: Number(q.get("flags") ?? had?.flags ?? 0), create: had?.create ?? index + 1, modify: bump(), lockIndex: (had?.lockIndex ?? 0) + (q.has("acquire") && !had?.session ? 1 : 0), session: q.has("acquire") ? sid : q.has("release") ? undefined : had?.session };
                    kv.set(k, e);
                    if (k === "flag" && body === "off") setTimeout(() => { const f = kv.get("flag"); kv.set("flag", { ...f, value: "on", modify: bump() }); }, 300);
                    return send(200, true);
                }
            }
            const json = body ? (() => { try { return JSON.parse(body); } catch { return null; } })() : null;
            if (path === "/v1/agent/service/register") {
                if (!json?.Name) return text(400, "Invalid service: missing name");
                const id = json.ID ?? json.Name;
                services.set(id, { ...json, ID: id, Address: json.Address ?? "" });
                if (json.Check) checks.set(`service:${id}`, { CheckID: `service:${id}`, ServiceID: id, Status: "critical", Output: "" });
                bump();
                return send(200);
            }
            if ((m = /^\/v1\/agent\/service\/deregister\/(.+)$/.exec(path))) { services.delete(m[1]); checks.delete(`service:${m[1]}`); bump(); return send(200); }
            if ((m = /^\/v1\/agent\/check\/(pass|warn|fail)\/(.+)$/.exec(path))) {
                const c = checks.get(m[2]);
                if (!c) return text(404, `CheckID "${m[2]}" does not have associated TTL`);
                c.Status = { pass: "passing", warn: "warning", fail: "critical" }[m[1]];
                c.Output = q.get("note") ?? "";
                bump();
                return send(200);
            }
            if (path === "/v1/catalog/services") {
                const out = {};
                for (const s of services.values()) out[s.Name] = [...new Set([...(out[s.Name] ?? []), ...(s.Tags ?? [])])];
                return send(200, out, index);
            }
            if ((m = /^\/v1\/health\/service\/(.+)$/.exec(path))) {
                let list = [...services.values()].filter((s) => s.Name === m[1]);
                if (q.get("tag")) list = list.filter((s) => (s.Tags ?? []).includes(q.get("tag")));
                const rows = list.map((s) => ({ Node: { Node: "node-1", Address: "10.0.0.1", Datacenter: "dc1" }, Service: { ID: s.ID, Service: s.Name, Tags: s.Tags ?? [], Address: s.Address, Meta: s.Meta ?? {}, Port: s.Port }, Checks: [{ CheckID: "serfHealth", Status: "passing" }, ...(checks.has(`service:${s.ID}`) ? [checks.get(`service:${s.ID}`)] : [])] }));
                return send(200, has("passing") ? rows.filter((r) => r.Checks.every((c) => c.Status === "passing")) : rows, index);
            }
            if (path === "/v1/session/create") {
                const id = randomUUID();
                sessions.set(id, json ?? {});
                bump();
                return send(200, { ID: id });
            }
            if ((m = /^\/v1\/session\/renew\/(.+)$/.exec(path))) {
                if (!sessions.has(m[1])) return text(404, `Session id '${m[1]}' not found`);
                return send(200, [{ ID: m[1], ...sessions.get(m[1]) }]);
            }
            if ((m = /^\/v1\/session\/destroy\/(.+)$/.exec(path))) {
                sessions.delete(m[1]);
                for (const e of kv.values()) if (e.session === m[1]) e.session = undefined;
                bump();
                return send(200, true);
            }
            text(404, "not found");
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { CONSUL_API_URL: `http://127.0.0.1:${port}`, CONSUL_TOKEN: TOKEN },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.kvReads) return "the Consul stand-in got no read";
            if (!stats.blocked) return "no blocking query was held";
            if (!stats.locks) return "no lock was tried";
            return null;
        },
    };
}
