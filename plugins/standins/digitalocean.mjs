// DigitalOcean's API for the digitalocean plugin's test, written from docs.digitalocean.com/reference/api:
// Bearer tokens, 401 { id: "unauthorized", message }, 404 { id: "not_found" }, paged lists (page,
// per_page, links.pages.next, meta.total; more than 200 per page is capped), RateLimit-Limit,
// -Remaining and -Reset on every answer, a 429 { id: "too_many_requests" } when asked for, droplets
// (POST gives links.actions with the create action; addresses appear only once it completed), tag
// filter, droplet actions, GET /v2/actions/:id going in-progress then completed or errored, domains,
// records with type and name filters (the filter's name is the whole name), Spaces keys.
//
//   start({ port }) -> { env: { DIGITALOCEAN_API_URL, DIGITALOCEAN_TOKEN }, close(), check() }
import { createServer } from "node:http";

const TOKEN = "qk-test-digitalocean";

export async function start({ port }) {
    const stats = { pages: 0, limited: 0, waits: 0 };
    const droplets = new Map();
    let id = 2000, firstAccount = true;
    for (let i = 0; i < 5; i++) droplets.set(1001 + i, { id: 1001 + i, name: `db-${i}`, status: "active", tags: [], networks: { v4: [{ type: "public", ip_address: `203.0.113.${i + 1}` }, { type: "private", ip_address: `10.0.0.${i + 1}` }] } });
    const actions = new Map();
    const newAction = (type, resource, end = "completed", then) => { const a = { id: ++id, status: "in-progress", type, resource_id: resource, polls: 0, end, then }; actions.set(a.id, a); return a; };
    const shown = ({ polls, end, then, ...a }) => a;
    const domains = new Map(), keys = new Map();
    const base = `http://127.0.0.1:${port}`;
    const nope = (s, i, message) => [s, { id: i, message, request_id: "qk-req-1" }];
    function page(url, key, list) {
        stats.pages++;
        const n = Math.min(Number(url.searchParams.get("per_page") ?? 20), 200), p = Number(url.searchParams.get("page") ?? 1);
        const size = key === "droplets" ? Math.min(n, 2) : n;
        const out = { [key]: list.slice((p - 1) * size, p * size), links: {}, meta: { total: list.length } };
        if (p * size < list.length) {
            const u = new URL(url); u.searchParams.set("page", p + 1); u.host = "api.digitalocean.com"; u.protocol = "https:"; u.port = "";
            out.links.pages = { next: u.toString() };
        }
        return [200, out];
    }
    function route(m, url, b) {
        const p = url.pathname;
        if (p === "/v2/account") {
            if (firstAccount) { firstAccount = false; stats.limited++; return [429, { id: "too_many_requests", message: "API Rate limit exceeded." }]; }
            return [200, { account: { status: "active", email: "ops@example.com" } }];
        }
        if (p === "/v2/droplets" && m === "GET") { const tag = url.searchParams.get("tag_name"); return page(url, "droplets", [...droplets.values()].filter((d) => !tag || d.tags.includes(tag))); }
        if (p === "/v2/droplets" && m === "POST") {
            if (!b.name || !b.region || !b.size || !b.image) return nope(422, "unprocessable_entity", "You specified an invalid size or image");
            const d = { id: ++id, name: b.name, status: "new", tags: b.tags ?? [], networks: { v4: [] } };
            droplets.set(d.id, d);
            const a = newAction("create", d.id, "completed", () => { d.status = "active"; d.networks.v4 = [{ type: "public", ip_address: "203.0.113.77" }]; });
            return [202, { droplet: d, links: { actions: [{ id: a.id, rel: "create", href: `${base}/v2/actions/${a.id}` }] } }];
        }
        let x = p.match(/^\/v2\/droplets\/(\d+)$/);
        if (x) {
            const d = droplets.get(Number(x[1]));
            if (!d) return nope(404, "not_found", "The resource you were accessing could not be found.");
            if (m === "GET") return [200, { droplet: d }];
            if (m === "DELETE") { droplets.delete(d.id); return [204, null]; }
        }
        x = p.match(/^\/v2\/droplets\/(\d+)\/actions$/);
        if (x && m === "POST") {
            if (!droplets.has(Number(x[1]))) return nope(404, "not_found", "The resource you were accessing could not be found.");
            const a = newAction(b.type, Number(x[1]), Number(x[1]) === 1002 ? "errored" : "completed");
            return [201, { action: shown(a) }];
        }
        x = p.match(/^\/v2\/actions\/(\d+)$/);
        if (x) {
            const a = actions.get(Number(x[1]));
            if (!a) return nope(404, "not_found", "The resource you were accessing could not be found.");
            stats.waits++;
            if (++a.polls >= 2) { a.status = a.end; a.then?.(); }
            return [200, { action: shown(a) }];
        }
        if (p === "/v2/domains" && m === "GET") return page(url, "domains", [...domains.values()].map(({ records, ...d }) => d));
        if (p === "/v2/domains" && m === "POST") {
            if (domains.has(b.name)) return nope(422, "unprocessable_entity", "Name already exists");
            const records = b.ip_address ? [{ id: ++id, type: "A", name: "@", data: b.ip_address, ttl: 1800 }] : [];
            domains.set(b.name, { name: b.name, ttl: 1800, records });
            return [201, { domain: { name: b.name, ttl: 1800 } }];
        }
        x = p.match(/^\/v2\/domains\/([^/]+)$/);
        if (x && m === "DELETE") { if (!domains.delete(x[1])) return nope(404, "not_found", "The resource you were accessing could not be found."); return [204, null]; }
        x = p.match(/^\/v2\/domains\/([^/]+)\/records(?:\/(\d+))?$/);
        if (x) {
            const d = domains.get(x[1]);
            if (!d) return nope(404, "not_found", "The resource you were accessing could not be found.");
            if (!x[2] && m === "GET") {
                const t = url.searchParams.get("type"), n = url.searchParams.get("name");
                return page(url, "domain_records", d.records.filter((r) => (!t || r.type === t) && (!n || (r.name === "@" ? d.name : `${r.name}.${d.name}`) === n)));
            }
            if (!x[2] && m === "POST") {
                if (!b.type || !b.name || !b.data) return nope(422, "unprocessable_entity", "Record needs type, name and data");
                const r = { id: ++id, ...b }; d.records.push(r); return [201, { domain_record: r }];
            }
            const r = d.records.find((q) => q.id === Number(x[2]));
            if (!r) return nope(404, "not_found", "The resource you were accessing could not be found.");
            if (m === "PATCH" || m === "PUT") { Object.assign(r, b); return [200, { domain_record: r }]; }
            if (m === "DELETE") { d.records.splice(d.records.indexOf(r), 1); return [204, null]; }
        }
        if (p === "/v2/spaces/keys" && m === "GET") return page(url, "keys", [...keys.values()].map((k) => ({ ...k, secret_key: "" })));
        if (p === "/v2/spaces/keys" && m === "POST") {
            const k = { name: b.name, access_key: `DOSPACES${++id}`, secret_key: `secret-${id}`, grants: b.grants, created_at: "2026-11-01T00:00:00Z" };
            keys.set(k.access_key, k); return [201, { key: k }];
        }
        x = p.match(/^\/v2\/spaces\/keys\/(.+)$/);
        if (x && m === "DELETE") { keys.delete(x[1]); return [204, null]; }
        return nope(404, "not_found", "The resource you were accessing could not be found.");
    }
    const server = createServer((req, res) => {
        let raw = "";
        req.on("data", (d) => (raw += d));
        req.on("end", () => {
            const reset = Math.floor(Date.now() / 1000) + 1;
            const heads = { "content-type": "application/json", "ratelimit-limit": "5000", "ratelimit-remaining": "4987", "ratelimit-reset": String(reset) };
            if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401, heads); return res.end(JSON.stringify({ id: "unauthorized", message: "Unable to authenticate you." })); }
            const url = new URL(req.url, base);
            let [s, v] = [500, null];
            try { [s, v] = route(req.method, url, raw ? JSON.parse(raw) : {}); } catch (e) { [s, v] = nope(400, "bad_request", String(e)); }
            res.writeHead(s, heads); res.end(v == null ? "" : JSON.stringify(v));
        });
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { DIGITALOCEAN_API_URL: base, DIGITALOCEAN_TOKEN: TOKEN },
        close() { server.close(); server.closeAllConnections?.(); },
        check: () => (stats.pages < 3 ? "lists were not paged" : !stats.waits ? "no action was waited on" : !stats.limited ? "the 429 was never met" : null),
    };
}
