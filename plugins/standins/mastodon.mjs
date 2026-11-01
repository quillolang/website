// A Mastodon server for the mastodon plugin's test, written from docs.joinmastodon.org: Bearer
// tokens (401 "The access token is invalid"), POST /api/v1/statuses (JSON, Idempotency-Key, 422 with
// { error: "Validation failed: ..." }, scheduled_at gives a ScheduledStatus, media_ids must be
// processed), GET and DELETE /api/v1/statuses/:id, POST /api/v2/media (multipart; 200 ready, 202 for
// video, then GET /api/v1/media/:id is 206 until done), GET /api/v1/timelines/home and tag/:hashtag
// (Link header with max_id and min_id, X-RateLimit-* headers), 429 with X-RateLimit-Reset. Status
// length is counted with a link as 23 characters and a mention without its domain.
//
//   start({ port }) -> { env: { MASTODON_API_URL, MASTODON_TOKEN }, close(), check() }
import { createServer } from "node:http";

const TOKEN = "qk-test-mastodon";

export async function start({ port }) {
    const base = `http://127.0.0.1:${port}`;
    const stats = { posts: 0, deduped: 0, uploads: 0, polled: 0, pages: 0, limited: 0 };
    const account = { id: "1", acct: "shop", display_name: "Shop", followers_count: 12 };
    const statuses = new Map(), keys = new Map(), media = new Map();
    let n = 100;
    const make = (id, html, extra = {}) => ({ id: String(id), created_at: "2026-11-01T10:00:00.000Z", url: `${base}/@shop/${id}`, content: html, visibility: "public", account, media_attachments: [], replies_count: 0, reblogs_count: 0, favourites_count: 1, reblog: null, ...extra });
    const home = [
        make(50, "<p>Hello &amp; welcome<br>to the shop</p><p>Second part</p>"),
        make(49, "", { account: { id: "2", acct: "ada" }, reblog: make(40, "<p>Boosted post</p>") }),
        make(48, "<p>Three</p>"), make(47, "<p>Four</p>"), make(46, "<p>Five</p>"),
    ];
    const count = (t) => t.split(/(\s+)/).map((w) => /^https?:\/\//.test(w) ? 23 : /^@[^@\s]+@/.test(w) ? 1 + w.slice(1).split("@")[0].length : [...w].length).reduce((a, b) => a + b, 0);
    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", () => {
            const raw = Buffer.concat(chunks);
            const send = (code, v, headers = {}) => { res.writeHead(code, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(v)); };
            const url = new URL(req.url, base);
            const path = url.pathname;
            if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, { error: "The access token is invalid" });
            if (path === "/api/v1/accounts/verify_credentials") return send(200, account);
            let m;
            if (req.method === "POST" && path === "/api/v2/media") {
                const ctype = req.headers["content-type"] ?? "";
                if (!ctype.startsWith("multipart/form-data")) return send(422, { error: "Validation failed: File can't be blank" });
                const text = raw.toString("latin1");
                if (!/name="file"; filename="[^"]+"/.test(text)) return send(422, { error: "Validation failed: File can't be blank" });
                const description = /name="description"\r\n\r\n([^\r]*)/.exec(text)?.[1] ?? null;
                const video = /Content-Type: video\//.test(text);
                const id = String(++n);
                const att = { id, type: video ? "video" : "image", url: video ? null : `${base}/media/${id}`, preview_url: `${base}/media/${id}.png`, description };
                media.set(id, { att, polls: video ? 2 : 0 });
                stats.uploads++;
                return send(video ? 202 : 200, att);
            }
            if (m = /^\/api\/v1\/media\/(\w+)$/.exec(path)) {
                const e = media.get(m[1]);
                if (!e) return send(404, { error: "Record not found" });
                stats.polled++;
                if (e.polls-- > 0) return send(206, e.att);
                e.att.url = `${base}/media/${m[1]}.mp4`;
                e.polls = 0;
                return send(200, e.att);
            }
            if (req.method === "POST" && path === "/api/v1/statuses") {
                const p = JSON.parse(raw.toString());
                const key = req.headers["idempotency-key"];
                if (key && keys.has(key)) { stats.deduped++; return send(200, keys.get(key)); }
                if (p.status === "refused by the server") return send(422, { error: "Validation failed: Text can't be blank" });
                if (p.status === "rate me" && !stats.limited++) return send(429, { error: "Too many requests" }, { "x-ratelimit-reset": new Date(Date.now() + 900).toISOString() });
                if (count(p.status ?? "") > 500) return send(422, { error: "Validation failed: Text character limit of 500 exceeded" });
                if (p.scheduled_at) return send(200, { id: "3221", scheduled_at: p.scheduled_at, params: { text: p.status } });
                for (const id of p.media_ids ?? []) if (!media.get(id)?.att.url) return send(422, { error: "Cannot attach a media still processing" });
                const s = make(++n, `<p>${p.status.replace(/&/g, "&amp;")}</p>`, { visibility: p.visibility ?? "public", media_attachments: (p.media_ids ?? []).map((id) => media.get(id).att), _text: p.status });
                statuses.set(s.id, s);
                if (key) keys.set(key, s);
                stats.posts++;
                return send(200, s);
            }
            if (m = /^\/api\/v1\/statuses\/(\w+)$/.exec(path)) {
                const s = statuses.get(m[1]);
                if (!s) return send(404, { error: "Record not found" });
                if (req.method === "DELETE") { statuses.delete(m[1]); return send(200, { ...s, text: s._text }); }
                return send(200, s);
            }
            if (path === "/api/v1/timelines/home") {
                const limit = Number(url.searchParams.get("limit") ?? 20);
                const max = url.searchParams.get("max_id");
                const from = max ? home.findIndex((s) => Number(s.id) < Number(max)) : 0;
                const items = from < 0 ? [] : home.slice(from, from + limit);
                if (max) stats.pages++;
                const links = [];
                if (items.length) links.push(`<${base}${path}?limit=${limit}&max_id=${items.at(-1).id}>; rel="next"`, `<${base}${path}?limit=${limit}&min_id=${items[0].id}>; rel="prev"`);
                return send(200, items, { ...(links.length ? { link: links.join(", ") } : {}), "x-ratelimit-limit": "300", "x-ratelimit-remaining": "299", "x-ratelimit-reset": "2026-11-01T10:05:00.000Z" });
            }
            if (m = /^\/api\/v1\/timelines\/tag\/(.+)$/.exec(path)) return decodeURIComponent(m[1]) === "quillo lang" ? send(200, [home[0]]) : send(404, { error: "bad tag encoding" });
            send(404, { error: "Record not found" });
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { MASTODON_API_URL: base, MASTODON_TOKEN: TOKEN },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.posts || !stats.deduped || !stats.uploads || !stats.polled || !stats.pages) return `the Mastodon stand-in was not reached by everything: ${JSON.stringify(stats)}`;
            if (stats.limited < 2) return "the plugin did not wait out the 429";
            return null;
        },
    };
}
