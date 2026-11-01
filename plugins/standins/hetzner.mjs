// Hetzner Cloud's API for the hetzner plugin's test, written from docs.hetzner.cloud: Bearer tokens,
// errors as { error: { code, message, details } } (404 not_found, 422 invalid_input with
// details.fields, 423 locked, 429 rate_limit_exceeded), RateLimit-Limit, -Remaining and -Reset on
// every answer, meta.pagination with next_page, actions { id, command, status running / success /
// error, progress, error }, servers (POST gives server, action, next_actions and a root_password
// unless ssh_keys came; a label_selector filter), server actions, volumes (attach, detach, resize;
// an attached volume cannot be deleted), firewalls (set_rules, apply_to_resources, each giving
// `actions`).
//
//   start({ port }) -> { env: { HETZNER_API_URL, HETZNER_API_TOKEN }, close(), check() }
import { createServer } from "node:http";

const TOKEN = "qk-test-hetzner";

export async function start({ port }) {
    const stats = { pages: 0, polls: 0, limited: 0, locked: 0 };
    let id = 5000, lockOnce = true, limitOnce = true;
    const servers = new Map([[1, { id: 1, name: "seed-1", status: "running", labels: {}, public_net: { ipv4: { ip: "198.51.100.1" } } }], [2, { id: 2, name: "seed-2", status: "running", labels: {}, public_net: { ipv4: { ip: "198.51.100.2" } } }], [3, { id: 3, name: "seed-3", status: "running", labels: {}, public_net: { ipv4: { ip: "198.51.100.3" } } }]]);
    const volumes = new Map(), firewalls = new Map(), actions = new Map();
    const act = (command, then, fail) => { const a = { id: ++id, command, status: "running", progress: 0, error: null, polls: 0, then, fail }; actions.set(a.id, a); return view(a); };
    const view = ({ polls, then, fail, ...a }) => a;
    const bad = (s, code, message, details) => [s, { error: { code, message, details: details ?? null } }];
    const list = (url, key, all) => {
        stats.pages++;
        const page = Number(url.searchParams.get("page") ?? 1), per = Number(url.searchParams.get("per_page") ?? 25);
        const last = Math.max(1, Math.ceil(all.length / per));
        return [200, { [key]: all.slice((page - 1) * per, page * per), meta: { pagination: { page, per_page: per, previous_page: page > 1 ? page - 1 : null, next_page: page < last ? page + 1 : null, last_page: last, total_entries: all.length } } }];
    };
    const selected = (s, sel) => { if (!sel) return true; const [k, v] = sel.split("="); return s.labels[k] === v; };
    function route(m, url, b) {
        const p = url.pathname;
        if (p === "/datacenters") {
            if (limitOnce) { limitOnce = false; stats.limited++; return bad(429, "rate_limit_exceeded", "limit of 3600 requests per hour reached"); }
            return [200, { datacenters: [{ id: 1, name: "fsn1-dc14" }] }];
        }
        let x = p.match(/^\/actions\/(\d+)$/);
        if (x) {
            const a = actions.get(Number(x[1]));
            if (!a) return bad(404, "not_found", "action not found");
            stats.polls++;
            if (++a.polls >= 2 && a.status === "running") {
                if (a.fail) { a.status = "error"; a.error = a.fail; a.progress = 100; }
                else { a.status = "success"; a.progress = 100; a.then?.(); }
            }
            return [200, { action: view(a) }];
        }
        if (p === "/servers" && m === "GET") { const n = url.searchParams.get("name"), sel = url.searchParams.get("label_selector"); return list(url, "servers", [...servers.values()].filter((s) => (!n || s.name === n) && selected(s, sel))); }
        if (p === "/servers" && m === "POST") {
            if (!/^[a-z0-9.-]+$/.test(b.name)) return bad(422, "invalid_input", "invalid input in field 'name'", { fields: [{ name: "name", messages: ["Name must be a valid hostname."] }] });
            const s = { id: ++id, name: b.name, status: "initializing", labels: b.labels ?? {}, public_net: { ipv4: { ip: "198.51.100.77" } } };
            servers.set(s.id, s);
            const action = act("create_server", () => { s.status = "running"; });
            return [201, { server: s, action, next_actions: [act("start_server"), act("attach_volume")], root_password: b.ssh_keys ? null : "a-generated-root-password" }];
        }
        x = p.match(/^\/servers\/(\d+)(?:\/actions\/(\w+))?$/);
        if (x) {
            const s = servers.get(Number(x[1]));
            if (!s) return bad(404, "not_found", "server with ID '" + x[1] + "' not found");
            if (m === "GET") return [200, { server: s }];
            if (m === "DELETE") { const a = act("delete_server", () => servers.delete(s.id)); return [200, { action: a }]; }
            if (x[2] === "rebuild") return [201, { action: act("rebuild_server", null, { code: "image_unavailable", message: "image no longer exists" }) }];
            if (x[2] === "reboot" && lockOnce) { lockOnce = false; stats.locked++; return bad(423, "locked", "server is locked by another action"); }
            return [201, { action: act(`${x[2]}_server`, () => { if (x[2] === "poweroff") s.status = "off"; }) }];
        }
        if (p === "/volumes" && m === "GET") return list(url, "volumes", [...volumes.values()]);
        if (p === "/volumes" && m === "POST") {
            const v = { id: ++id, name: b.name, size: b.size, server: b.server ?? null, status: "creating", location: { name: b.location } };
            volumes.set(v.id, v);
            return [201, { volume: v, action: act("create_volume", () => { v.status = "available"; }), next_actions: [] }];
        }
        x = p.match(/^\/volumes\/(\d+)(?:\/actions\/(\w+))?$/);
        if (x) {
            const v = volumes.get(Number(x[1]));
            if (!v) return bad(404, "not_found", "volume not found");
            if (m === "DELETE") { if (v.server) return bad(422, "service_error", "volume is attached to a server"); volumes.delete(v.id); return [204, null]; }
            if (x[2] === "attach") { if (b.automount !== true) return bad(422, "invalid_input", "expected automount"); v.server = b.server; return [201, { action: act("attach_volume") }]; }
            if (x[2] === "detach") { v.server = null; return [201, { action: act("detach_volume") }]; }
            if (x[2] === "resize") { if (b.size <= v.size) return bad(422, "invalid_input", "size must grow"); v.size = b.size; return [201, { action: act("resize_volume") }]; }
        }
        if (p === "/firewalls" && m === "GET") { const n = url.searchParams.get("name"); return list(url, "firewalls", [...firewalls.values()].filter((f) => !n || f.name === n)); }
        if (p === "/firewalls" && m === "POST") { const f = { id: ++id, name: b.name, rules: b.rules ?? [], applied_to: [] }; firewalls.set(f.id, f); return [201, { firewall: f, actions: [act("set_firewall_rules")] }]; }
        x = p.match(/^\/firewalls\/(\d+)(?:\/actions\/(\w+))?$/);
        if (x) {
            const f = firewalls.get(Number(x[1]));
            if (!f) return bad(404, "not_found", "firewall not found");
            if (m === "DELETE") { firewalls.delete(f.id); return [204, null]; }
            if (x[2] === "set_rules") { f.rules = b.rules; return [201, { actions: [act("set_firewall_rules"), act("apply_firewall")] }]; }
            if (x[2] === "apply_to_resources") { for (const t of b.apply_to) if (t.type !== "server" && t.type !== "label_selector") return bad(422, "invalid_input", "invalid type"); f.applied_to.push(...b.apply_to); return [201, { actions: b.apply_to.map(() => act("apply_firewall")) }]; }
        }
        return bad(404, "not_found", `no route ${m} ${p}`);
    }
    const server = createServer((req, res) => {
        let raw = "";
        req.on("data", (d) => (raw += d));
        req.on("end", () => {
            const heads = { "content-type": "application/json", "ratelimit-limit": "3600", "ratelimit-remaining": "3599", "ratelimit-reset": String(Math.floor(Date.now() / 1000) + 1) };
            if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401, heads); return res.end(JSON.stringify({ error: { code: "unauthorized", message: "unable to authenticate" } })); }
            let [s, v] = [500, null];
            try { [s, v] = route(req.method, new URL(req.url, "http://x"), raw ? JSON.parse(raw) : {}); } catch (e) { [s, v] = bad(400, "json_error", String(e)); }
            res.writeHead(s, heads); res.end(v == null ? "" : JSON.stringify(v));
        });
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { HETZNER_API_URL: `http://127.0.0.1:${port}`, HETZNER_API_TOKEN: TOKEN },
        close() { server.close(); server.closeAllConnections?.(); },
        check: () => (stats.pages < 3 ? "lists were not paged" : !stats.polls ? "no action was waited on" : !stats.limited ? "the 429 was never met" : !stats.locked ? "the locked answer was never met" : null),
    };
}
