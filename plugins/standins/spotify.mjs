// Spotify's accounts service and Web API for the spotify plugin's test, written from
// developer.spotify.com ("Client Credentials Flow", "Authorization Code with PKCE Flow", the Web API
// reference, "Rate limits"): POST /api/token for client_credentials with HTTP Basic, and
// authorization_code and refresh_token with client_id alone under PKCE, the code_verifier checked
// against the S256 challenge given at /authorize; /search (limit at most 50, offset + limit at most
// 1000), /tracks/:id, /tracks?ids= (at most 50, null for an unknown id), /playlists/:id with `fields`,
// /playlists/:id/tracks (limit at most 100, whole `next` links), POST .../tracks (at most 100 uris).
// Errors are { error: { status, message } }; a 429 has Retry-After in seconds. Only a user's token
// can make or change a playlist. No browser is here to agree to a sign-in, so the test uses a fixed
// code whose challenge is that of RFC 7636's verifier.
//
//   start({ port }) -> { env: { SPOTIFY_API_URL, SPOTIFY_ACCOUNTS_URL, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET }, close(), check() }
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";

const ID = "standinclient", SECRET = "standinsecret", CODE = "AQDcode", VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

export async function start({ port }) {
    const base = `http://127.0.0.1:${port}`;
    const stats = { appTokens: 0, nexts: 0, tooMany: 0, limited: 0, biggestAdd: 0, exchanged: 0 };
    const app = new Set(), users = new Map(), lists = new Map();
    const refresh = new Set();
    let n = 0, challenge = createHash("sha256").update(VERIFIER).digest("base64url");
    const trackId = (i) => `4uLU6hMCjMI75M1A2tK${100 + i}`;
    const track = (id, name) => ({ id, name, uri: `spotify:track:${id}`, artists: [{ name: "Nina Simone" }] });
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v, headers = {}) => { res.writeHead(code, { "content-type": "application/json", ...headers }); res.end(v === undefined ? "" : JSON.stringify(v)); };
            const fail = (status, message, headers) => send(status, { error: { status, message } }, headers);
            const url = new URL(req.url, "http://x");
            const p = url.pathname, q = url.searchParams;
            if (p === "/api/token") {
                const f = new URLSearchParams(body);
                const bad = (error, error_description) => send(400, { error, error_description });
                if (f.get("grant_type") === "client_credentials") {
                    if (req.headers.authorization !== `Basic ${Buffer.from(`${ID}:${SECRET}`).toString("base64")}`) return bad("invalid_client", "Invalid client");
                    const t = "BQD" + randomBytes(12).toString("hex"); app.add(t); stats.appTokens++;
                    return send(200, { access_token: t, token_type: "Bearer", expires_in: 3600 });
                }
                if (f.get("client_id") !== ID) return bad("invalid_client", "Invalid client");
                const grant = () => { const t = "BQU" + randomBytes(12).toString("hex"), r = "AQR" + randomBytes(12).toString("hex"); users.set(t, "ada"); refresh.add(r); return send(200, { access_token: t, token_type: "Bearer", scope: "playlist-modify-private", expires_in: 3600, refresh_token: r }); };
                if (f.get("grant_type") === "authorization_code") {
                    if (f.get("code") !== CODE) return bad("invalid_grant", "Invalid authorization code");
                    if (createHash("sha256").update(f.get("code_verifier") ?? "").digest("base64url") !== challenge) return bad("invalid_grant", "code_verifier was incorrect");
                    stats.exchanged++;
                    return grant();
                }
                if (f.get("grant_type") === "refresh_token") return refresh.delete(f.get("refresh_token")) ? grant() : bad("invalid_grant", "Invalid refresh token");
                return bad("unsupported_grant_type", "grant_type must be client_credentials, authorization_code or refresh_token");
            }
            const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
            const isUser = users.has(token);
            if (!isUser && !app.has(token)) return fail(401, "Invalid access token");
            const b = body ? JSON.parse(body) : {};
            let m;
            if (p === "/v1/search") {
                const limit = Number(q.get("limit") ?? 20), offset = Number(q.get("offset") ?? 0);
                if (limit > 50) { stats.tooMany++; return fail(400, "Invalid limit"); }
                if (offset + limit > 1000) return fail(400, "Invalid offset");
                const ty = q.get("type"), total = ty === "track" ? 1400 : 3;
                const seen = Math.max(0, Math.min(limit, total - offset));
                if (offset) stats.nexts++;
                return send(200, { [`${ty}s`]: { href: "x", limit, offset, total, next: offset + seen < total ? "more" : null, previous: null, items: Array.from({ length: seen }, (_, i) => ({ id: `${ty}${offset + i}`, name: `${ty} ${offset + i}` })) } });
            }
            if (p === "/v1/tracks/busybusybusybusybusy00") { if (!stats.limited) { stats.limited++; return fail(429, "API rate limit exceeded", { "retry-after": "1" }); } return send(200, track("busy", "After the wait")); }
            if (p === "/v1/tracks/longlonglonglonglong00") return fail(429, "API rate limit exceeded", { "retry-after": "86400" });
            if (m = /^\/v1\/tracks\/(\w+)$/.exec(p)) return /^0+$/.test(m[1]) ? fail(404, "Resource not found") : send(200, track(m[1], "Feeling Good"));
            if (p === "/v1/tracks") {
                const ids = q.get("ids").split(",");
                if (ids.length > 50) { stats.tooMany++; return fail(400, "Too many ids requested"); }
                return send(200, { tracks: ids.map((i) => (i.endsWith("7") ? null : track(i, "T"))) });
            }
            if (p === "/v1/users/ada/playlists" && req.method === "POST") {
                if (!isUser) return fail(403, "Insufficient client scope");
                const id = `3cEYpjA9oz9GiPac4AsH${String(++n).padStart(2, "0")}`;
                lists.set(id, { id, name: b.name, description: b.description, public: b.public, owner: { id: "ada" }, snapshot_id: "s0", tracks: [] });
                return send(201, { ...lists.get(id), tracks: { total: 0 } });
            }
            if (m = /^\/v1\/playlists\/(\w+)\/tracks$/.exec(p)) {
                if (req.method === "POST") {
                    if (!isUser) return fail(403, "Insufficient client scope");
                    const l = lists.get(m[1]);
                    if (!l) return fail(404, "Resource not found");
                    if (b.uris.length > 100) return fail(400, "You can add a maximum of 100 tracks per request.");
                    stats.biggestAdd = Math.max(stats.biggestAdd, b.uris.length);
                    l.tracks.push(...b.uris); l.snapshot_id = `s${l.tracks.length}`;
                    return send(201, { snapshot_id: l.snapshot_id });
                }
                const limit = Number(q.get("limit") ?? 100), offset = Number(q.get("offset") ?? 0);
                if (limit > 100) { stats.tooMany++; return fail(400, "Invalid limit"); }
                if (offset) stats.nexts++;
                const total = 330;
                const items = Array.from({ length: Math.min(limit, total - offset) }, (_, i) => ({ added_at: "2026-01-01T00:00:00Z", track: (offset + i) % 110 === 109 ? null : track(trackId(offset + i), `Song ${offset + i}`) }));
                return send(200, { href: "x", limit, offset, total, items, next: offset + limit < total ? `${base}/v1/playlists/${m[1]}/tracks?offset=${offset + limit}&limit=${limit}` : null });
            }
            if (m = /^\/v1\/playlists\/(\w+)$/.exec(p)) {
                const l = lists.get(m[1]);
                if (l) return send(200, { id: l.id, name: l.name, public: l.public, owner: l.owner, snapshot_id: l.snapshot_id, tracks: { total: l.tracks.length } });
                return send(200, { id: m[1], name: "Today's Top Hits", public: true, owner: { id: "spotify" }, snapshot_id: "s", tracks: { total: 330 } });
            }
            return fail(404, "Service not found");
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { SPOTIFY_API_URL: `${base}/v1`, SPOTIFY_ACCOUNTS_URL: base, SPOTIFY_CLIENT_ID: ID, SPOTIFY_CLIENT_SECRET: SECRET },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (stats.appTokens !== 1) return `the app's token was fetched ${stats.appTokens} times, not kept`;
            if (!stats.nexts) return "`next` was never followed";
            if (stats.tooMany) return "a request asked for too many";
            if (!stats.limited) return "the Spotify stand-in never saw a 429 waited out";
            if (!stats.exchanged) return "no code was exchanged with its verifier";
            if (stats.biggestAdd !== 100) return "tracks were not added in hundreds";
            return null;
        },
    };
}
