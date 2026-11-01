// A Matrix homeserver for the matrix_chat plugin's test, written from the Client-Server API
// specification: POST /_matrix/client/v3/login (m.login.password with an m.id.user identifier),
// Bearer tokens, GET account/whoami, POST join/{roomIdOrAlias}, GET directory/room/{alias}, PUT
// rooms/{id}/send/{type}/{txnId} (a repeated txnId gives the same event), GET sync (since, timeout,
// next_batch, rooms.join.*.timeline), GET rooms/{id}/messages (dir=b, from, limit, `end` absent on
// the last page). Errors are { errcode, error }: M_FORBIDDEN, M_UNKNOWN_TOKEN, M_NOT_FOUND, and
// M_LIMIT_EXCEEDED with retry_after_ms. Room ids and aliases must arrive percent-encoded.
//
//   start({ port }) -> { env: { MATRIX_API_URL, MATRIX_USER, MATRIX_PASSWORD }, close(), check() }
import { createServer } from "node:http";

const ROOM = "!abc123:example.org", ALIAS = "#ops:example.org", TOKEN = "syt_qk_test";

export async function start({ port }) {
    const stats = { logins: 0, sends: 0, dedup: 0, syncs: 0, limited: 0, encoded: 0 };
    const events = [{ type: "m.room.message", event_id: "$old1", sender: "@ada:example.org", origin_server_ts: 1790000000000, content: { msgtype: "m.text", body: "Good morning" } }];
    const txns = new Map();
    let n = 1;
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            const fail = (code, errcode, error, extra = {}) => send(code, { errcode, error, ...extra });
            const url = new URL(req.url, "http://x");
            const p = url.pathname.replace("/_matrix/client/v3", "");
            if (req.method === "POST" && p === "/login") {
                const b = JSON.parse(body);
                if (b.type !== "m.login.password" || b.identifier?.type !== "m.id.user") return fail(400, "M_UNKNOWN", "Bad login type.");
                if (b.identifier.user !== "bot" || b.password !== "hunter2") return fail(403, "M_FORBIDDEN", "Invalid username or password");
                stats.logins++;
                return send(200, { user_id: "@bot:example.org", access_token: TOKEN, device_id: "QUILLODEV", home_server: "example.org" });
            }
            if (req.headers.authorization !== `Bearer ${TOKEN}`) return fail(401, "M_UNKNOWN_TOKEN", "Access token unknown or expired", { soft_logout: false });
            if (p === "/account/whoami") return send(200, { user_id: "@bot:example.org", device_id: "QUILLODEV" });
            let m;
            if (req.method === "POST" && (m = /^\/join\/(.+)$/.exec(p))) {
                if (!/^%23|^%21/.test(m[1])) return fail(400, "M_INVALID_PARAM", "the room must be percent-encoded");
                stats.encoded++;
                return decodeURIComponent(m[1]) === ALIAS || decodeURIComponent(m[1]) === ROOM ? send(200, { room_id: ROOM }) : fail(404, "M_NOT_FOUND", "No known servers");
            }
            if (m = /^\/directory\/room\/(.+)$/.exec(p)) return decodeURIComponent(m[1]) === ALIAS ? send(200, { room_id: ROOM, servers: ["example.org"] }) : fail(404, "M_NOT_FOUND", `Room alias ${decodeURIComponent(m[1])} not found.`);
            if (req.method === "PUT" && (m = /^\/rooms\/([^/]+)\/send\/([^/]+)\/([^/]+)$/.exec(p))) {
                if (decodeURIComponent(m[1]) !== ROOM) return fail(403, "M_FORBIDDEN", "User @bot:example.org not in room");
                const key = m[3];
                if (txns.has(key)) { stats.dedup++; return send(200, { event_id: txns.get(key) }); }
                const content = JSON.parse(body);
                if (!content.msgtype || typeof content.body !== "string") return fail(400, "M_BAD_JSON", "msgtype and body are required");
                if (content.format && !content.formatted_body) return fail(400, "M_BAD_JSON", "format needs formatted_body");
                if (content.body === "limit me" && !stats.limited++) return fail(429, "M_LIMIT_EXCEEDED", "Too Many Requests", { retry_after_ms: 300 });
                const event_id = `$ev${++n}`;
                events.push({ type: decodeURIComponent(m[2]), event_id, sender: "@bot:example.org", origin_server_ts: 1790000000000 + n, content });
                txns.set(key, event_id);
                stats.sends++;
                return send(200, { event_id });
            }
            if (p === "/sync") {
                stats.syncs++;
                const since = Number(url.searchParams.get("since") ?? 0);
                const fresh = events.slice(since);
                return send(200, { next_batch: String(events.length), rooms: { join: { [ROOM]: { timeline: { events: fresh, limited: false, prev_batch: "t0" } } }, invite: since ? {} : { "!invited:example.org": { invite_state: { events: [] } } } } });
            }
            if (m = /^\/rooms\/([^/]+)\/messages$/.exec(p)) {
                if (url.searchParams.get("dir") !== "b") return fail(400, "M_INVALID_PARAM", "dir is required");
                const limit = Number(url.searchParams.get("limit") ?? 10);
                const from = Number(url.searchParams.get("from") ?? events.length);
                const chunk = events.slice(Math.max(0, from - limit), from).reverse();
                const end = from - limit;
                return send(200, { start: String(from), chunk, ...(end > 0 ? { end: String(end) } : {}) });
            }
            fail(404, "M_UNRECOGNIZED", "Unrecognized request");
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { MATRIX_API_URL: `http://127.0.0.1:${port}`, MATRIX_USER: "bot", MATRIX_PASSWORD: "hunter2" },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.logins || !stats.sends || !stats.syncs || !stats.encoded) return `the Matrix stand-in was not reached by everything: ${JSON.stringify(stats)}`;
            if (!stats.dedup) return "the same transaction id was not sent twice";
            if (stats.limited < 2) return "the plugin did not wait out M_LIMIT_EXCEEDED";
            return null;
        },
    };
}
