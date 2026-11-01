// Reddit's sign-in and API for the reddit plugin's test, written from reddit.com/dev/api, the OAuth2
// wiki and "API Rules": POST /api/v1/access_token with HTTP Basic, grant_type password (a wrong
// password is a 200 with { error: "invalid_grant" }) or client_credentials; the API under `bearer`,
// a User-Agent checked (a generic one gets a 429); listings { kind: "Listing", data: { after, before,
// dist, children: [{ kind, data }] } }, limit at most 100, `after` and about 1000 at the most;
// raw_json=1 or text has &amp; for &; /comments/:id as [post listing, comment listing], replies nested,
// `more` stubs; /api/submit and /api/comment as forms with api_type=json, answering a 200 with
// { json: { errors: [[code, message, field]], data } }; x-ratelimit-used, -remaining and -reset on
// every answer. An app-only token cannot post. A private subreddit is a 403 with reason "private".
//
//   start({ port, ports }) -> { env: { REDDIT_* }, close(), check() }
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const ID = "standin-id", SECRET = "standin-secret", USER = "ada", PASS = "correct horse";

export async function start({ port }) {
    const base = `http://127.0.0.1:${port}`;
    const stats = { script: 0, app: 0, afters: 0, tooMany: 0, limited: 0, badAgent: 0, noRaw: 0, posts: 0, slept: 0 };
    const tokens = new Map();
    let n = 1000, lastPost = 0, spentAt = 0;
    const postData = (i) => ({ id: `p${i}`, name: `t3_p${i}`, title: i === 1 ? "Tips & tricks" : `Post ${i}`, author: "grace", score: i, subreddit: "rust" });
    const comment = (id, author, parent, replies) => ({ kind: "t1", data: { id, name: `t1_${id}`, author, body: `from ${author}`, score: 1, parent_id: parent, replies: replies ?? "" } });
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const rate = { "x-ratelimit-used": "4", "x-ratelimit-remaining": "600.0", "x-ratelimit-reset": "1" };
            const send = (code, v, headers = {}) => { res.writeHead(code, { "content-type": "application/json; charset=UTF-8", ...rate, ...headers }); res.end(JSON.stringify(v)); };
            const url = new URL(req.url, "http://x");
            const p = url.pathname, q = url.searchParams;
            const ua = req.headers["user-agent"] ?? "";
            if (!/^[^:]+:[^:]+:[^:]+ \(by \/?u\/\w+\)$/.test(ua)) { stats.badAgent++; return send(429, { message: "Too Many Requests", error: 429 }); }
            if (p === "/api/v1/access_token") {
                if (req.headers.authorization !== `Basic ${Buffer.from(`${ID}:${SECRET}`).toString("base64")}`) return send(401, { message: "Unauthorized", error: 401 });
                const f = new URLSearchParams(body);
                const grant = (kind) => { const t = randomBytes(12).toString("hex"); tokens.set(t, kind); stats[kind]++; send(200, { access_token: t, token_type: "bearer", expires_in: 86400, scope: "*" }); };
                if (f.get("grant_type") === "password") return f.get("username") === USER && f.get("password") === PASS ? grant("script") : send(200, { error: "invalid_grant" });
                if (f.get("grant_type") === "client_credentials") return grant("app");
                return send(200, { error: "unsupported_grant_type" });
            }
            const kind = tokens.get((req.headers.authorization ?? "").replace(/^bearer /, ""));
            if (!kind) return send(401, { message: "Unauthorized", error: 401 });
            if (q.get("raw_json") !== "1") stats.noRaw++;
            let m;
            const listing = (all) => {
                const limit = Number(q.get("limit") ?? 25);
                if (limit > 100) { stats.tooMany++; return send(400, { message: "Bad Request", error: 400 }); }
                const after = q.get("after"), at = after ? all.findIndex((c) => c.data.name === after) + 1 : 0;
                if (after) stats.afters++;
                const slice = all.slice(at, at + limit);
                send(200, { kind: "Listing", data: { after: at + limit < all.length ? slice.at(-1).data.name : null, before: null, dist: slice.length, children: slice } });
            };
            if (p === "/api/v1/me") return kind === "script" ? send(200, { name: USER, id: "u1" }) : send(403, { message: "Forbidden", error: 403 });
            if (p === "/expired") { if (!stats.killed) { stats.killed = 1; tokens.clear(); return send(401, { message: "Unauthorized", error: 401 }); } return listing([]); }
            if (m = /^\/r\/([^/]+)\/(\w+)$/.exec(p)) {
                if (m[1] === "nosuchsubreddit") return send(404, { reason: "banned", message: "Not Found", error: 404 });
                if (m[1] === "secretclub") return send(403, { reason: "private", message: "Forbidden", error: 403 });
                if (m[1] === "busy" && !stats.limited) { stats.limited++; return send(429, { message: "Too Many Requests", error: 429 }, { "x-ratelimit-remaining": "0.0", "x-ratelimit-reset": "1" }); }
                if (m[1] === "spent") {
                    // The first page leaves nothing in the window, so the next should wait for it.
                    if (!q.get("after")) { spentAt = Date.now(); rate["x-ratelimit-remaining"] = "0.0"; return listing(Array.from({ length: 101 }, (_, i) => ({ kind: "t3", data: postData(i) }))); }
                    if (Date.now() - spentAt >= 900) stats.slept++;
                    return listing(Array.from({ length: 101 }, (_, i) => ({ kind: "t3", data: postData(i) })));
                }
                return listing(Array.from({ length: m[1] === "busy" ? 2 : 987 }, (_, i) => ({ kind: "t3", data: { ...postData(i), title: i === 1 && q.get("raw_json") !== "1" ? "Tips &amp; tricks" : postData(i).title } })));
            }
            if (m = /^\/user\/(\w+)\/submitted$/.exec(p)) return listing(Array.from({ length: 7 }, (_, i) => ({ kind: "t3", data: postData(i) })));
            if (m = /^\/comments\/(\w+)$/.exec(p)) {
                const tree = { kind: "Listing", data: { children: [comment("a", "ada", "t3_abc123", { kind: "Listing", data: { children: [comment("b", "grace", "t1_a", { kind: "Listing", data: { children: [comment("c", "linus", "t1_b"), { kind: "more", data: { count: 12, children: ["x"] } }] } })] } }), comment("d", "alan", "t3_abc123"), { kind: "more", data: { count: 30, children: ["y"] } }] } };
                return send(200, [{ kind: "Listing", data: { children: [{ kind: "t3", data: postData(5) }] } }, tree]);
            }
            if (req.method === "POST" && (p === "/api/submit" || p === "/api/comment")) {
                const f = new URLSearchParams(body);
                const fail = (...e) => send(200, { json: { errors: [e], data: {} } });
                if (f.get("api_type") !== "json") return send(200, { jquery: [] });
                if (kind !== "script") return send(403, { message: "Forbidden", error: 403 });
                if (p === "/api/submit") {
                    const k = f.get("kind");
                    if (k === "link" && !/^https?:/.test(f.get("url") ?? "")) return fail("BAD_URL", "you should check that url", "url");
                    if (Date.now() - lastPost < 60000 && stats.posts >= 2) return fail("RATELIMIT", "you are doing that too much. try again in 9 minutes.", "ratelimit");
                    stats.posts++; lastPost = Date.now();
                    const id = `new${++n}`;
                    return send(200, { json: { errors: [], data: { url: `https://www.reddit.com/r/${f.get("sr")}/comments/${id}/`, drafts_count: 0, id, name: `t3_${id}` } } });
                }
                if (f.get("thing_id") === "t3_locked") return fail("THREAD_LOCKED", "Comments are locked.", "parent");
                const id = `c${++n}`;
                return send(200, { json: { errors: [], data: { things: [{ kind: "t1", data: { id, name: `t1_${id}`, body: f.get("text"), parent_id: f.get("thing_id"), author: USER } }] } } });
            }
            return send(404, { message: "Not Found", error: 404 });
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { REDDIT_API_URL: base, REDDIT_AUTH_URL: base, REDDIT_CLIENT_ID: ID, REDDIT_CLIENT_SECRET: SECRET, REDDIT_USERNAME: USER, REDDIT_PASSWORD: PASS, REDDIT_USER_AGENT: "web:org.quillo.standin:1.0.0 (by /u/ada)" },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.script || !stats.app) return `the Reddit stand-in did not see both sign-ins: ${JSON.stringify(stats)}`;
            if (stats.badAgent) return "a request came with an unacceptable User-Agent";
            if (stats.noRaw) return "a request came without raw_json=1";
            if (!stats.afters) return "`after` was never followed";
            if (stats.tooMany) return "a list asked for more than 100";
            if (!stats.limited) return "the Reddit stand-in never saw a 429 waited out";
            if (!stats.slept) return "the plugin did not wait when no requests were left in the window";
            return null;
        },
    };
}
