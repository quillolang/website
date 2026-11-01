// An Asana API for the asana plugin's test, written from developers.asana.com's reference, "Pagination"
// and "Webhooks": Bearer token, the { data } envelope both ways, limit 1 to 100, next_page { offset,
// path, uri }, an expired offset refused, opt_fields honoured, errors { errors: [{ message, help }] },
// 429 with Retry-After, tasks needing a workspace, projects or parent, stories. POST /webhooks calls
// the target with an X-Hook-Secret and needs it echoed with a 200 or 204 before answering 201, then
// delivers an event with X-Hook-Signature (hex HMAC-SHA256 of the body by that secret).
//
//   start({ port }) -> { env: { ASANA_API_URL, ASANA_ACCESS_TOKEN, ASANA_WORKSPACE }, close(), check() }
import { createServer } from "node:http";
import { createHmac, randomBytes } from "node:crypto";

const TOKEN = "qk-test-asana", WORKSPACE = "1100000000000001";

export async function start({ port }) {
    const stats = { offsets: 0, tasks: 0, limited: 0, handshakes: 0, delivered: 0, noLimit: 0 };
    let n = 1200000000000000;
    const gid = () => String(++n);
    const projects = new Map(), tasks = new Map(), hooks = new Map();
    for (let i = 0; i < 245; i++) { const p = { gid: gid(), resource_type: "project", name: `Project ${i}`, color: "light-green", archived: false, workspace: WORKSPACE }; projects.set(p.gid, p); }
    const pick = (x, q) => { const f = q.get("opt_fields"); return f ? { gid: x.gid, ...Object.fromEntries(f.split(",").map((k) => [k, x[k]])) } : x; };
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", async () => {
            const send = (code, v, headers = {}) => { res.writeHead(code, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(v)); };
            const fail = (code, message, headers) => send(code, { errors: [{ message, help: "For more information on API status codes and how to handle them, read the docs on errors: https://developers.asana.com/docs/errors" }] }, headers);
            if (req.headers.authorization !== `Bearer ${TOKEN}`) return fail(401, "Not Authorized");
            const url = new URL(req.url, "http://x");
            const p = url.pathname.replace("/api/1.0", ""), q = url.searchParams;
            const parsed = body ? JSON.parse(body) : {};
            const b = parsed.data ?? {};
            if (body && !parsed.data) return fail(400, "data: Missing input");
            const list = (all) => {
                const limit = Number(q.get("limit") ?? 0);
                if (!limit) { stats.noLimit++; return send(200, { data: all.slice(0, 1000) }); }
                if (limit > 100) return fail(400, "limit: Must be between 1 and 100");
                const offset = q.get("offset"), at = offset ? Number(Buffer.from(offset, "base64url").toString()) : 0;
                if (offset) stats.offsets++;
                const next = at + limit < all.length ? Buffer.from(String(at + limit)).toString("base64url") : null;
                send(200, { data: all.slice(at, at + limit).map((x) => pick(x, q)), next_page: next ? { offset: next, path: `${p}?limit=${limit}&offset=${next}`, uri: `https://app.asana.com/api/1.0${p}?limit=${limit}&offset=${next}` } : null });
            };
            let m;
            if (p === "/users/me") return send(200, { data: { gid: "1", name: "Ada Lovelace", email: "ada@example.com", workspaces: [{ gid: WORKSPACE, name: "Quillo" }] } });
            if (p === "/projects/busy") { if (!stats.limited) { stats.limited++; return fail(429, "You have made too many requests recently. Please, be chill.", { "retry-after": "1" }); } return send(200, { data: { gid: "busy", name: "After the wait" } }); }
            if (p === "/projects/premium") return fail(402, "This feature is only available to premium users.");
            if (p === "/projects" && req.method === "POST") { return send(201, { data: { gid: gid(), resource_type: "project", ...b } }); }
            if (p === "/projects") {
                if (q.get("workspace") === "expired") return fail(400, "offset: Your pagination token has expired.");
                if (q.get("workspace") !== WORKSPACE) return fail(400, "workspace: Not a recognized ID");
                return list([...projects.values()]);
            }
            if (m = /^\/projects\/([^/]+)\/tasks$/.exec(p)) return list([...tasks.values()].filter((t) => t.projects?.includes(m[1])));
            if (m = /^\/projects\/([^/]+)$/.exec(p)) return projects.has(m[1]) ? send(200, { data: projects.get(m[1]) }) : fail(404, "project: Unknown object: " + m[1]);
            if (p === "/tasks") {
                if (!b.workspace && !b.projects && !b.parent) return fail(400, "You should specify one of workspace, parent, projects");
                const t = { gid: gid(), resource_type: "task", completed: false, ...b, stories: [] };
                tasks.set(t.gid, t); stats.tasks++;
                return send(201, { data: t });
            }
            if (m = /^\/tasks\/([^/]+)\/stories$/.exec(p)) {
                const t = tasks.get(m[1]);
                if (!t) return fail(404, "task: Unknown object: " + m[1]);
                if (req.method === "POST") { const s = { gid: gid(), resource_subtype: "comment_added", type: "comment", text: b.text }; t.stories.push(s); return send(201, { data: s }); }
                return list([{ gid: gid(), resource_subtype: "added_to_project", type: "system", text: "added" }, ...t.stories]);
            }
            if (m = /^\/tasks\/([^/]+)$/.exec(p)) {
                const t = tasks.get(m[1]);
                if (!t) return fail(404, "task: Unknown object: " + m[1]);
                if (req.method === "DELETE") { tasks.delete(m[1]); return send(200, { data: {} }); }
                if (req.method === "PUT") Object.assign(t, b);
                const { stories, ...shown } = t;
                return send(200, { data: pick(shown, q) });
            }
            if (p === "/webhooks" && req.method === "POST") {
                // The handshake: the target must echo the secret, within a second or so.
                const secret = randomBytes(16).toString("hex");
                const shake = await fetch(b.target, { method: "POST", headers: { "x-hook-secret": secret }, signal: AbortSignal.timeout(10000) }).catch((e) => ({ status: 0, headers: new Headers(), error: String(e) }));
                if (![200, 204].includes(shake.status) || shake.headers.get("x-hook-secret") !== secret) return fail(400, `The remote server did not respond with the handshake secret (status ${shake.status} ${shake.error ?? ""})`);
                stats.handshakes++;
                const event = JSON.stringify({ events: [{ action: "changed", resource: { gid: b.resource, resource_type: "task" } }] });
                const hit = await fetch(b.target, { method: "POST", headers: { "content-type": "application/json", "x-hook-signature": createHmac("sha256", secret).update(event).digest("hex") }, body: event, signal: AbortSignal.timeout(10000) }).catch(() => ({ status: 0 }));
                if (hit.status === 200) stats.delivered++;
                const w = { gid: gid(), resource_type: "webhook", active: true, target: b.target, resource: { gid: b.resource }, last_delivery: hit.status === 200 };
                hooks.set(w.gid, w);
                return send(201, { data: w });
            }
            if (m = /^\/webhooks\/([^/]+)$/.exec(p)) { if (!hooks.delete(m[1])) return fail(404, "webhook: Unknown object"); return send(200, { data: {} }); }
            return fail(404, "Not found");
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { ASANA_API_URL: `http://127.0.0.1:${port}/api/1.0`, ASANA_ACCESS_TOKEN: TOKEN, ASANA_WORKSPACE: WORKSPACE },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.tasks) return "the Asana stand-in made no task";
            if (!stats.offsets) return "the Asana stand-in's offset was never followed";
            if (stats.noLimit) return "a list came without a limit";
            if (!stats.handshakes || !stats.delivered) return `the webhook's handshake or delivery failed: ${JSON.stringify(stats)}`;
            if (!stats.limited) return "the Asana stand-in never saw a 429 waited out";
            return null;
        },
    };
}
