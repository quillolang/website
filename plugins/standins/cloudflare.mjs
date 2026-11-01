// A Cloudflare API for the cloudflare plugin's test, written from developers.cloudflare.com/api: Bearer
// tokens, the { success, errors: [{ code, message }], messages, result, result_info } envelope,
// /zones?name=, /zones/:id/dns_records (page, per_page, total_pages; type, name, content filters;
// POST, PATCH, DELETE; content checked for A records, code 9005), /zones/:id/purge_cache (at most 30
// files), /accounts/:a/storage/kv/namespaces/:ns: PUT and GET /values/:key (a raw body, not the
// envelope; expiration_ttl at least 60; a missing key 404 with code 10009), PUT /bulk, GET /keys with
// a cursor in result_info. /edge-error acts as an HTML 502 from the edge, /rate-me as a 429.
//
//   start({ port }) -> { env: { CLOUDFLARE_API_URL, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_KV_NAMESPACE }, close(), check() }
import { createServer } from "node:http";

const TOKEN = "qk-test-cloudflare", ZONE = "023e105f4ecef8ad9ca31a8372d0c353", ACCOUNT = "023e105f4ecef8ad9ca31a8372d0c354", NS = "0f2ac74b498b48028cb68387c421e279";

export async function start({ port }) {
    const stats = { dnsPages: 0, purges: 0, biggestPurge: 0, kvCursor: 0, created: 0, patched: 0, limited: 0 };
    const records = new Map(), kv = new Map();
    let n = 0;
    for (let i = 0; i < 130; i++) { const id = `rec${++n}`; records.set(id, { id, type: "CNAME", name: `h${i}.example.com`, content: "example.com", ttl: 1, proxied: false }); }
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v, h = {}) => { res.writeHead(code, { "content-type": "application/json", ...h }); res.end(JSON.stringify(v)); };
            const ok = (result, extra = {}) => send(200, { success: true, errors: [], messages: [], result, ...extra });
            const fail = (status, code, message, chain, h) => send(status, { success: false, errors: [{ code, message, ...(chain ? { error_chain: chain } : {}) }], messages: [], result: null }, h);
            if (req.headers.authorization !== `Bearer ${TOKEN}`) return fail(403, 9109, "Invalid access token");
            const url = new URL(req.url, "http://x");
            const p = url.pathname.replace("/client/v4", ""), q = url.searchParams;
            if (p === "/edge-error") { res.writeHead(502, { "content-type": "text/html" }); return res.end("<html><body>502 Bad Gateway</body></html>"); }
            if (p === "/rate-me") { if (!stats.limited++) return fail(429, 10000, "Rate limited", null, { "retry-after": "1" }); return ok([1, 2]); }
            if (p === "/zones") return q.get("name") === "example.com" ? ok([{ id: ZONE, name: "example.com" }]) : ok([]);
            const paged = (all) => {
                const page = Number(q.get("page") ?? 1), per = Number(q.get("per_page") ?? 20);
                if (per > 100) return fail(400, 1004, "per_page must be at most 100");
                if (page > 1) stats.dnsPages++;
                return ok(all.slice((page - 1) * per, page * per), { result_info: { page, per_page: per, count: Math.min(per, all.length), total_count: all.length, total_pages: Math.max(1, Math.ceil(all.length / per)) } });
            };
            const b = body && (req.headers["content-type"] ?? "").includes("json") ? JSON.parse(body) : null;
            let m;
            if (m = /^\/zones\/([^/]+)\/dns_records(?:\/([^/]+))?$/.exec(p)) {
                if (m[1] !== ZONE) return fail(404, 7003, "Could not route to /zones/0000/dns_records, perhaps your object identifier is invalid?", [{ code: 7000, message: "No route for that URI" }]);
                if (req.method === "GET") return paged([...records.values()].filter((r) => (!q.get("type") || r.type === q.get("type")) && (!q.get("name") || r.name === q.get("name"))));
                if (req.method === "POST") {
                    if (b.type === "A" && !/^\d+\.\d+\.\d+\.\d+$/.test(b.content)) return fail(400, 9005, "Content for A record must be a valid IPv4 address.");
                    const r = { id: `rec${++n}`, ttl: 1, proxied: false, ...b };
                    records.set(r.id, r); stats.created++;
                    return ok(r);
                }
                const r = records.get(m[2]);
                if (!r) return fail(404, 81044, "Record does not exist.");
                if (req.method === "PATCH") { Object.assign(r, b); stats.patched++; return ok(r); }
                if (req.method === "DELETE") { records.delete(m[2]); return ok({ id: m[2] }); }
            }
            if (m = /^\/zones\/([^/]+)\/purge_cache$/.exec(p)) {
                const size = (b.files ?? b.tags ?? b.hosts ?? b.prefixes ?? []).length;
                if (size > 30) return fail(400, 1015, "You may purge up to 30 files at a time");
                if (!size && !b.purge_everything) return fail(400, 1012, "Request must contain one of purge_everything, files, tags, hosts or prefixes");
                stats.purges++; stats.biggestPurge = Math.max(stats.biggestPurge, size);
                return ok({ id: "9a7806061c88ada191ed06f989cc3dac" });
            }
            if (m = /^\/accounts\/([^/]+)\/storage\/kv\/namespaces\/([^/]+)\/(.+)$/.exec(p)) {
                if (m[1] !== ACCOUNT || m[2] !== NS) return fail(404, 10013, "namespace not found");
                const rest = m[3];
                if (rest === "bulk" && req.method === "PUT") { for (const i of b) { if (typeof i.value !== "string") return fail(400, 10021, "value must be a string"); kv.set(i.key, { value: i.value, metadata: i.metadata }); } return ok({ successful_key_count: b.length, unsuccessful_keys: [] }); }
                if (rest === "keys") {
                    const prefix = q.get("prefix") ?? "", at = Number(q.get("cursor") ?? 0), size = 10;
                    const keys = [...kv.keys()].filter((k) => k.startsWith(prefix)).sort();
                    if (q.get("cursor")) stats.kvCursor++;
                    const more = at + size < keys.length;
                    return ok(keys.slice(at, at + size).map((name) => ({ name, ...(kv.get(name).metadata ? { metadata: kv.get(name).metadata } : {}) })), { result_info: { count: keys.length, cursor: more ? String(at + size) : "" } });
                }
                const v = /^values\/(.+)$/.exec(rest);
                if (v) {
                    if (/%2F|%20/.test(v[1]) === false && /[/ ]/.test(v[1])) return fail(400, 10019, "the key must be percent-encoded");
                    const key = decodeURIComponent(v[1]);
                    if (req.method === "PUT") {
                        const ttl = q.get("expiration_ttl");
                        if (ttl && Number(ttl) < 60) return fail(400, 10033, "Invalid expiration_ttl of 30. Expiration TTL must be at least 60.");
                        kv.set(key, { value: body });
                        return ok(null);
                    }
                    if (req.method === "DELETE") { kv.delete(key); return ok(null); }
                    if (!kv.has(key)) return fail(404, 10009, "get: 'key not found'");
                    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
                    return res.end(kv.get(key).value);
                }
            }
            fail(404, 7000, "No route for that URI");
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { CLOUDFLARE_API_URL: `http://127.0.0.1:${port}/client/v4`, CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ZONE_ID: ZONE, CLOUDFLARE_ACCOUNT_ID: ACCOUNT, CLOUDFLARE_KV_NAMESPACE: NS },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.dnsPages || !stats.purges || !stats.kvCursor || !stats.created || !stats.patched) return `the Cloudflare stand-in was not reached by everything: ${JSON.stringify(stats)}`;
            if (stats.biggestPurge !== 30) return `the biggest purge was ${stats.biggestPurge} files`;
            if (stats.limited < 2) return "the plugin did not wait out the 429";
            return null;
        },
    };
}
