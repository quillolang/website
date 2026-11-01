// A Trello REST API for the trello plugin's test, written from developer.atlassian.com/cloud/trello:
// key and token in the query or an `Authorization: OAuth oauth_consumer_key=..., oauth_token=...`
// header, /members/me/boards, /boards/:id, its /lists, /cards and /actions (limit at most 1000,
// `before` an action id, newest first), /lists, /lists/:id/cards, /cards with its fields in the query,
// a card's actions/comments, /webhooks whose POST first calls the callbackURL with HEAD, here
// answered by a stand-in check of the host. Errors are plain text ("invalid id", "unauthorized card
// permission requested"), a 429 is JSON with `error` and `message`.
//
//   start({ port }) -> { env: { TRELLO_API_URL, TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_API_SECRET, TRELLO_BOARD }, close(), check() }
import { createServer } from "node:http";

const KEY = "qktrellokey", TOKEN = "qktrellotoken", BOARD = "b0ard0000000000000000001";

export async function start({ port }) {
    const stats = { cards: 0, befores: 0, limited: 0, tooMany: 0, headerAuth: 0 };
    let n = 1000;
    const id = () => (++n).toString(16).padStart(24, "a");
    const lists = new Map(), cards = new Map(), hooks = new Map();
    for (const name of ["To do", "Doing"]) { const l = { id: id(), name, idBoard: BOARD, closed: false }; lists.set(l.id, l); }
    const actions = [];
    for (let i = 0; i < 2300; i++) actions.unshift({ id: id(), type: i % 100 ? "updateCard" : "commentCard", data: {} });
    const server = createServer((req, res) => {
        res.on("close", () => {});
        const url = new URL(req.url, "http://x");
        const p = url.pathname.replace(/^\/1/, ""), q = url.searchParams;
        const send = (code, v) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(v)); };
        const text = (code, t) => { res.writeHead(code, { "content-type": "text/plain" }); res.end(t); };
        const h = req.headers.authorization ?? "";
        const a = /^OAuth oauth_consumer_key="([^"]+)", oauth_token="([^"]+)"$/.exec(h);
        if (a) stats.headerAuth++;
        if ((a?.[1] ?? q.get("key")) !== KEY) return text(401, "invalid key");
        if ((a?.[2] ?? q.get("token")) !== TOKEN) return text(401, "invalid token");
        let m;
        if (p === "/busy") { if (!stats.limited) { stats.limited++; res.writeHead(429, { "content-type": "application/json", "retry-after": "1" }); return res.end(JSON.stringify({ error: "API_TOKEN_LIMIT_EXCEEDED", message: "Rate limit exceeded" })); } return send(200, { ok: true }); }
        if (p === "/members/me/boards") return send(200, [{ id: BOARD, name: "Roadmap", url: "https://trello.com/b/XyZ987/roadmap", closed: false }]);
        if (p === "/boards/forbidden") return text(401, "unauthorized permission requested");
        if (m = /^\/boards\/([^/]+)(?:\/(lists|cards|actions))?$/.exec(p)) {
            if (m[1] !== BOARD) return text(400, "invalid id");
            if (!m[2]) return send(200, { id: BOARD, name: "Roadmap", desc: "", url: "https://trello.com/b/XyZ987/roadmap", closed: false });
            if (m[2] === "lists") return send(200, [...lists.values()].filter((l) => !l.closed));
            if (m[2] === "cards") return send(200, [...cards.values()].filter((c) => !c.closed));
            const limit = Number(q.get("limit") ?? 50);
            if (limit > 1000) { stats.tooMany++; return text(400, "invalid value for limit"); }
            const filter = q.get("filter")?.split(",");
            let all = actions.filter((x) => !filter || filter.includes(x.type));
            if (q.get("before")) { stats.befores++; all = all.slice(all.findIndex((x) => x.id === q.get("before")) + 1); }
            return send(200, all.slice(0, limit));
        }
        if (p === "/lists" && req.method === "POST") {
            if (!q.get("idBoard") || !q.get("name")) return text(400, "invalid value for name");
            const l = { id: id(), name: q.get("name"), idBoard: q.get("idBoard"), closed: false }; lists.set(l.id, l);
            return send(200, l);
        }
        if (m = /^\/lists\/([^/]+)\/cards$/.exec(p)) return lists.has(m[1]) ? send(200, [...cards.values()].filter((c) => c.idList === m[1])) : text(400, "invalid id");
        if (p === "/cards" && req.method === "POST") {
            if (!lists.has(q.get("idList"))) return text(400, "invalid value for idList");
            const c = { id: id(), shortLink: `s${n}`, shortUrl: `https://trello.com/c/s${n}`, name: q.get("name"), desc: q.get("desc") ?? "", due: q.get("due"), idList: q.get("idList"), idMembers: q.get("idMembers")?.split(",") ?? [], closed: false, badges: { comments: 0 } };
            cards.set(c.id, c); stats.cards++;
            return send(200, c);
        }
        if (m = /^\/cards\/([^/]+)\/actions\/comments$/.exec(p)) {
            const c = [...cards.values()].find((x) => x.id === m[1] || x.shortLink === m[1]);
            if (!c) return text(404, "card not found");
            c.badges.comments++;
            return send(200, { id: id(), type: "commentCard", data: { text: q.get("text") } });
        }
        if (m = /^\/cards\/([^/]+)$/.exec(p)) {
            const c = [...cards.values()].find((x) => x.id === m[1] || x.shortLink === m[1]);
            if (!c) return text(404, "The requested resource was not found.");
            if (req.method === "DELETE") { cards.delete(c.id); return send(200, { limits: {} }); }
            if (req.method === "PUT") { for (const [k, v] of q) c[k] = k === "closed" ? v === "true" : v; }
            return send(200, c);
        }
        if (p === "/webhooks" && req.method === "POST") {
            const cb = q.get("callbackURL") ?? "";
            if (cb.includes("down.example")) return text(400, `URL (${cb}) did not return 200 status code, got 503`);
            if (!q.get("idModel")) return text(400, "invalid value for idModel");
            const w = { id: id(), description: q.get("description"), idModel: q.get("idModel"), callbackURL: cb, active: true }; hooks.set(w.id, w);
            return send(200, w);
        }
        if (m = /^\/webhooks\/([^/]+)$/.exec(p)) { if (!hooks.delete(m[1])) return text(404, "webhook not found"); return send(200, {}); }
        return text(404, "Cannot GET " + p);
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { TRELLO_API_URL: `http://127.0.0.1:${port}/1`, TRELLO_API_KEY: KEY, TRELLO_TOKEN: TOKEN, TRELLO_API_SECRET: "trello-app-secret", TRELLO_BOARD: BOARD },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.cards) return "the Trello stand-in made no card";
            if (!stats.befores) return "the Trello stand-in was never walked back with `before`";
            if (!stats.limited) return "the Trello stand-in never saw a 429 waited out";
            if (stats.tooMany) return "a list asked for more than 1000";
            if (!stats.headerAuth) return "the key and token did not come in the header";
            return null;
        },
    };
}
