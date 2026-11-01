// Dropbox's HTTP API for the dropbox plugin's test, written from Dropbox's "HTTP documentation" and
// its "OAuth Guide". POST /oauth2/token takes grant_type=refresh_token with the app's basic auth.
// The content routes read Dropbox-API-Arg, which must be ASCII (others are refused, as they are on
// the real one), with Content-Type application/octet-stream, and give metadata in the body, or in
// Dropbox-API-Result for a download. Errors are { error_summary: "path/not_found/..", error } with
// 409, 429 with Retry-After once, and 401 expired_access_token once, to see a token fetched again.
// Upload sessions keep offsets: start, append_v2 (one append pretends its answer was lost, by a
// 409 incorrect_offset with correct_offset), finish. files/list_folder pages by `limit` and cursor.
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";

const REFRESH = "standin-dbx-refresh", APP = "standinappkey", SECRET = "standinappsecret";
const bad = (tag, sub) => ({ error_summary: `${tag}/${sub}/..`, error: { ".tag": tag, [tag]: { ".tag": sub } } });

export async function start({ port }) {
    const stats = { tokens: 0, expired: false, limited: false, sessions: 0, lostAnswers: 0, asciiChecked: 0 };
    const files = new Map(), folders = new Set([""]), links = new Map(), sessions = new Map();
    let valid = new Set(), calls = 0, nextRev = 1, listed = [];
    const meta = (path, f) => ({ ".tag": "file", name: path.split("/").pop(), path_lower: path.toLowerCase(), path_display: path, id: `id:${createHash("md5").update(path).digest("base64url").slice(0, 12)}`, rev: f.rev, size: f.body.length, content_hash: createHash("sha256").update(f.body).digest("hex"), server_modified: "2026-11-01T10:00:00Z" });
    const put = (path, body, mode) => {
        const had = files.get(path);
        if (had) {
            if (mode === "add" || mode?.[".tag"] === "add") return bad("path", "conflict");
            if (mode?.[".tag"] === "update" && mode.update !== had.rev) return bad("path", "conflict");
        }
        const f = { body, rev: (nextRev++).toString(16).padStart(9, "0") + "a" };
        files.set(path, f);
        for (let p = path; p.includes("/"); ) { p = p.slice(0, p.lastIndexOf("/")); folders.add(p); }
        return meta(path, f);
    };
    const entriesOf = (path, recursive) => {
        const out = [];
        for (const d of folders) if (d && d.startsWith(path + "/") && (recursive || !d.slice(path.length + 1).includes("/"))) out.push({ ".tag": "folder", name: d.split("/").pop(), path_lower: d.toLowerCase(), path_display: d });
        for (const [p, f] of files) if (p.startsWith(path + "/") && (recursive || !p.slice(path.length + 1).includes("/"))) out.push(meta(p, f));
        return out.sort((a, b) => (a.path_lower < b.path_lower ? -1 : 1));
    };
    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", () => {
            const url = new URL(req.url, "http://x");
            const raw = Buffer.concat(chunks);
            const send = (code, v, h = {}) => { res.writeHead(code, { "content-type": "application/json", ...h }); res.end(JSON.stringify(v)); };
            if (url.pathname === "/oauth2/token") {
                const f = new URLSearchParams(raw.toString());
                if (req.headers.authorization !== "Basic " + Buffer.from(`${APP}:${SECRET}`).toString("base64")) return send(401, { error: "invalid_client", error_description: "Invalid client_id or client_secret" });
                if (f.get("grant_type") !== "refresh_token" || f.get("refresh_token") !== REFRESH) return send(400, { error: "invalid_grant", error_description: "refresh token is invalid or revoked" });
                const t = "sl." + randomBytes(10).toString("hex");
                valid = new Set([t]); stats.tokens++;
                return send(200, { access_token: t, token_type: "bearer", expires_in: 14400 });
            }
            const bearer = (req.headers.authorization ?? "").replace(/^Bearer /, "");
            if (!valid.has(bearer)) return send(401, { error_summary: "invalid_access_token/..", error: { ".tag": "invalid_access_token" } });
            calls++;
            if (calls === 4 && !stats.expired) { stats.expired = true; valid.clear(); return send(401, { error_summary: "expired_access_token/..", error: { ".tag": "expired_access_token" } }); }
            if (calls === 7 && !stats.limited) { stats.limited = true; return send(429, { error_summary: "too_many_requests/..", error: { reason: { ".tag": "too_many_requests" }, retry_after: 1 } }, { "retry-after": "1" }); }
            const route = url.pathname.replace(/^\/2\//, "");
            const rawArg = req.headers["dropbox-api-arg"];
            if (rawArg !== undefined) {
                if (!/^[\x20-\x7e]*$/.test(rawArg)) { res.writeHead(400, { "content-type": "text/plain" }); return res.end("Error in call: HTTP header Dropbox-API-Arg: could not decode input as JSON"); }
                stats.asciiChecked++;
                if (req.headers["content-type"] !== "application/octet-stream") { res.writeHead(400, { "content-type": "text/plain" }); return res.end(`Error in call: Bad HTTP "Content-Type" header: "${req.headers["content-type"]}"`); }
            }
            const arg = rawArg ? JSON.parse(rawArg) : (raw.length && /json/.test(req.headers["content-type"] ?? "") ? JSON.parse(raw.toString()) : {});
            const result = (v) => (v.error_summary ? send(409, v) : send(200, v));
            switch (route) {
                case "files/upload": return result(put(arg.path, raw, arg.mode));
                case "files/download": {
                    const f = files.get(arg.path);
                    if (!f) return send(409, bad("path", "not_found"));
                    res.writeHead(200, { "content-type": "application/octet-stream", "dropbox-api-result": JSON.stringify(meta(arg.path, f)).replace(/[\u0080-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")) });
                    return res.end(f.body);
                }
                case "files/upload_session/start": { const id = randomBytes(8).toString("hex"); sessions.set(id, { bytes: raw, lost: true }); stats.sessions++; return send(200, { session_id: id }); }
                case "files/upload_session/append_v2": {
                    const s = sessions.get(arg.cursor.session_id);
                    if (!s) return send(409, bad("not_found", "session"));
                    if (arg.cursor.offset !== s.bytes.length) return send(409, { error_summary: "incorrect_offset/..", error: { ".tag": "incorrect_offset", correct_offset: s.bytes.length } });
                    s.bytes = Buffer.concat([s.bytes, raw]);
                    if (s.lost) { s.lost = false; stats.lostAnswers++; return send(409, { error_summary: "incorrect_offset/..", error: { ".tag": "incorrect_offset", correct_offset: s.bytes.length } }); }
                    return send(200, null);
                }
                case "files/upload_session/finish": {
                    const s = sessions.get(arg.cursor.session_id);
                    if (!s) return send(409, { error_summary: "lookup_failed/not_found/..", error: { ".tag": "lookup_failed", lookup_failed: { ".tag": "not_found" } } });
                    if (arg.cursor.offset !== s.bytes.length) return send(409, { error_summary: "lookup_failed/incorrect_offset/..", error: { ".tag": "lookup_failed", lookup_failed: { ".tag": "incorrect_offset", correct_offset: s.bytes.length } } });
                    sessions.delete(arg.cursor.session_id);
                    return result(put(arg.commit.path, Buffer.concat([s.bytes, raw]), arg.commit.mode));
                }
                case "files/list_folder": {
                    if (arg.path && !folders.has(arg.path)) return send(409, bad("path", "not_found"));
                    listed = entriesOf(arg.path, arg.recursive);
                    const n = arg.limit ?? 2;
                    return send(200, { entries: listed.slice(0, n), cursor: `c${n}.${n}`, has_more: n < listed.length });
                }
                case "files/list_folder/continue": {
                    const [at, n] = arg.cursor.slice(1).split(".").map(Number);
                    return send(200, { entries: listed.slice(at, at + n), cursor: `c${at + n}.${n}`, has_more: at + n < listed.length });
                }
                case "files/get_metadata": { const f = files.get(arg.path); if (f) return send(200, meta(arg.path, f)); if (folders.has(arg.path)) return send(200, { ".tag": "folder", name: arg.path.split("/").pop(), path_display: arg.path }); return send(409, bad("path", "not_found")); }
                case "files/create_folder_v2": { if (folders.has(arg.path)) return send(409, bad("path", "conflict")); folders.add(arg.path); return send(200, { metadata: { name: arg.path.split("/").pop(), path_display: arg.path } }); }
                case "files/move_v2": { const f = files.get(arg.from_path); if (!f) return send(409, { error_summary: "from_lookup/not_found/..", error: { ".tag": "from_lookup" } }); files.delete(arg.from_path); files.set(arg.to_path, f); return send(200, { metadata: meta(arg.to_path, f) }); }
                case "files/delete_v2": { if (!files.delete(arg.path)) return send(409, { error_summary: "path_lookup/not_found/..", error: { ".tag": "path_lookup", path_lookup: { ".tag": "not_found" } } }); return send(200, { metadata: { name: arg.path } }); }
                case "sharing/create_shared_link_with_settings": {
                    if (!files.has(arg.path)) return send(409, { error_summary: "path/not_found/..", error: { ".tag": "path", path: { ".tag": "not_found" } } });
                    const had = links.get(arg.path);
                    const m = { ".tag": "file", url: had?.url ?? `https://www.dropbox.com/s/${randomBytes(6).toString("hex")}/${arg.path.split("/").pop()}?dl=0`, name: arg.path.split("/").pop(), path_lower: arg.path.toLowerCase() };
                    if (had) return send(409, { error_summary: "shared_link_already_exists/metadata/.", error: { ".tag": "shared_link_already_exists", shared_link_already_exists: { ".tag": "metadata", metadata: m } } });
                    links.set(arg.path, m);
                    return send(200, m);
                }
                default: return send(404, { error_summary: "unknown route" });
            }
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { DROPBOX_API_URL: `http://127.0.0.1:${port}`, DROPBOX_CONTENT_URL: `http://127.0.0.1:${port}`, DROPBOX_REFRESH_TOKEN: REFRESH, DROPBOX_APP_KEY: APP, DROPBOX_APP_SECRET: SECRET },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.tokens) return "no token was fetched";
            if (!stats.expired || stats.tokens < 2) return "the expired token was not replaced";
            if (!stats.limited) return "the 429 was not met";
            if (!stats.sessions) return "no upload session was started";
            if (!stats.lostAnswers) return "the lost append was not met";
            if (!stats.asciiChecked) return "no Dropbox-API-Arg was read";
            return null;
        },
    };
}
