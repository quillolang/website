// Google Drive's v3 API for the google_drive plugin's test, written from Google's reference for
// files (list, get, create, update, delete, export) and permissions, and the guides "Upload file
// data" and "Search for files". Token auth from the shared OAuth stand-in. /upload/drive/v3/files
// takes uploadType=multipart (multipart/related: metadata JSON, then media) and uploadType=resumable
// (Location, then PUTs with Content-Range in multiples of 256 KiB, 308 with a Range header, `bytes
// */N` to ask, and one piece failed with a 503 to see it recovered). `q` is read by a small parser
// for the terms used here, quoted values with their \' and \\ escapes, and anything else gives
// 400 invalid, as on the real API. `fields` shapes answers, including nextPageToken,files(...). A
// download of a Google Doc gives 403 fileNotDownloadable; a 403 rateLimitExceeded is given once.
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { googleAuth } from "./google_drive_oauth.mjs";

const SCOPE = "https://www.googleapis.com/auth/drive";
const FOLDER = "application/vnd.google-apps.folder";

function quoted(s, i) {
    if (s[i] !== "'") return null;
    let v = ""; i++;
    while (i < s.length && s[i] !== "'") { if (s[i] === "\\") i++; v += s[i++]; }
    return i < s.length ? [v, i + 1] : null;
}
// Terms joined by ` and `: name = 'x', name contains 'x', mimeType = 'x', 'id' in parents, trashed = false.
function parseQuery(q) {
    const terms = []; let i = 0;
    const skip = () => { while (q[i] === " ") i++; };
    for (;;) {
        skip();
        let m;
        const rest = q.slice(i);
        if ((m = /^(name|mimeType) (=|contains) /.exec(rest))) {
            i += m[0].length;
            const r = quoted(q, i); if (!r) return null;
            i = r[1]; terms.push([m[1], m[2], r[0]]);
        } else if ((m = /^trashed = (true|false)/.exec(rest))) { i += m[0].length; terms.push(["trashed", "=", m[1] === "true"]); }
        else if (q[i] === "'") {
            const r = quoted(q, i); if (!r) return null;
            i = r[1]; if (!q.slice(i).startsWith(" in parents")) return null;
            i += 11; terms.push(["parents", "in", r[0]]);
        } else return null;
        skip();
        if (i >= q.length) return terms;
        if (!q.slice(i).startsWith("and ")) return null;
        i += 4;
    }
}
const test = (t, f) => (t[0] === "name" ? (t[1] === "=" ? f.name === t[2] : f.name.includes(t[2])) : t[0] === "mimeType" ? f.mimeType === t[2] : t[0] === "trashed" ? (f.trashed ?? false) === t[2] : (f.parents ?? []).includes(t[2]));
function shape(f, fields) {
    if (!fields) return { id: f.id, name: f.name, mimeType: f.mimeType };
    const o = {};
    for (const k of fields.split(",")) if (f[k] !== undefined) o[k] = f[k];
    return o;
}

export async function start({ port }) {
    const auth = googleAuth({ scope: SCOPE, tokenUri: `http://127.0.0.1:${port}/token` });
    const stats = { lists: 0, multipart: 0, sessions: 0, failedPiece: false, asked: 0, limited: false };
    const files = new Map(), sessions = new Map();
    let next = 1, calls = 0;
    const add = (meta, body) => {
        const id = `f${next++}${randomBytes(3).toString("hex")}`;
        const f = { kind: "drive#file", id, mimeType: "application/octet-stream", parents: ["root"], modifiedTime: "2026-11-01T10:00:00.000Z", ...meta, body: body ?? Buffer.alloc(0), permissions: [] };
        if (body) { f.size = String(body.length); f.md5Checksum = createHash("md5").update(body).digest("hex"); }
        files.set(id, f);
        return f;
    };
    add({ name: "Minutes", mimeType: "application/vnd.google-apps.document" });
    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", () => {
            const url = new URL(req.url, "http://x");
            const raw = Buffer.concat(chunks);
            if (url.pathname === "/token") return auth.token(raw.toString(), res);
            const q = url.searchParams;
            const send = (code, v, h = {}) => { res.writeHead(code, { "content-type": "application/json; charset=UTF-8", ...h }); res.end(v === undefined ? "" : JSON.stringify(v)); };
            const fail = (code, reason, message) => send(code, { error: { code, message, errors: [{ domain: "global", reason, message }] } });
            const session = sessions.get(url.pathname);
            if (session && req.method === "PUT") {
                const range = req.headers["content-range"] ?? "";
                let m;
                if ((m = /^bytes \*\/(\d+)$/.exec(range))) { stats.asked++; return send(308, undefined, session.have.length ? { range: `bytes=0-${session.have.length - 1}` } : {}); }
                m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
                if (!m) return fail(400, "badContent", "Invalid Content-Range");
                const [a, b, total] = m.slice(1).map(Number);
                if (a !== session.have.length) return fail(400, "badContent", "Out of order piece");
                if (raw.length !== b - a + 1) return fail(400, "badContent", "Length does not match Content-Range");
                if (b + 1 !== total && raw.length % (256 * 1024)) return fail(400, "badContent", "A piece must be a multiple of 256 KiB");
                if (a > 0 && !stats.failedPiece) { stats.failedPiece = true; return send(503, { error: { code: 503, message: "Service Unavailable" } }); }
                session.have = Buffer.concat([session.have, raw]);
                if (b + 1 < total) return send(308, undefined, { range: `bytes=0-${b}` });
                sessions.delete(url.pathname);
                return send(200, shape(add(session.meta, session.have), q.get("fields") ?? session.fields));
            }
            if (!auth.valid(req.headers.authorization)) return send(401, { error: { code: 401, message: "Invalid Credentials", errors: [{ reason: "authError" }] } });
            calls++;
            if (calls === 5 && !stats.limited) { stats.limited = true; return fail(403, "rateLimitExceeded", "Rate Limit Exceeded"); }
            if (url.pathname === "/upload/drive/v3/files") {
                if (q.get("uploadType") === "multipart") {
                    const b = /boundary=(.+)$/.exec(req.headers["content-type"] ?? "")?.[1];
                    if (!/^multipart\/related/.test(req.headers["content-type"] ?? "") || !b) return fail(400, "badContent", "Unsupported content with type: " + req.headers["content-type"]);
                    const text = raw.toString("latin1"), parts = text.split(`--${b}`).slice(1, -1).map((p) => { const i = p.indexOf("\r\n\r\n"); return Buffer.from(p.slice(i + 4, -2), "latin1"); });
                    if (parts.length !== 2) return fail(400, "badContent", "A multipart upload has two parts");
                    stats.multipart++;
                    return send(200, shape(add(JSON.parse(parts[0].toString()), parts[1]), q.get("fields")));
                }
                if (q.get("uploadType") === "resumable") {
                    if (!req.headers["x-upload-content-length"]) return fail(400, "badContent", "No X-Upload-Content-Length");
                    const p = `/upload/session/${randomBytes(6).toString("hex")}`;
                    sessions.set(p, { meta: JSON.parse(raw.toString()), have: Buffer.alloc(0), fields: q.get("fields") });
                    stats.sessions++;
                    return send(200, undefined, { location: `http://127.0.0.1:${port}${p}` });
                }
                return fail(400, "invalid", "uploadType must be multipart, media or resumable");
            }
            const p = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
            if (p[0] !== "drive" || p[1] !== "v3" || p[2] !== "files") return fail(404, "notFound", "Not Found");
            const id = p[3];
            if (!id && req.method === "GET") {
                stats.lists++;
                const terms = q.get("q") ? parseQuery(q.get("q")) : [];
                if (!terms) return fail(400, "invalid", "Invalid Value");
                let rows = [...files.values()].filter((f) => terms.every((t) => test(t, f)));
                if (q.get("orderBy") === "name") rows.sort((a, b) => (a.name < b.name ? -1 : 1));
                const size = Number(q.get("pageSize") ?? 100), at = Number(q.get("pageToken") ?? 0);
                const want = /files\(([^)]*)\)/.exec(q.get("fields") ?? "")?.[1];
                return send(200, { ...(at + size < rows.length ? { nextPageToken: String(at + size) } : {}), files: rows.slice(at, at + size).map((f) => shape(f, want)) });
            }
            if (!id && req.method === "POST") return send(200, shape(add(JSON.parse(raw.toString())), q.get("fields")));
            const f = files.get(id);
            if (!f) return fail(404, "notFound", `File not found: ${id}.`);
            if (p[4] === "export") {
                if (!f.mimeType.startsWith("application/vnd.google-apps.")) return fail(403, "fileNotExportable", "Export only supports Docs Editors files.");
                res.writeHead(200, { "content-type": q.get("mimeType") }); return res.end("Minutes of the meeting\n");
            }
            if (p[4] === "permissions") {
                if (req.method === "POST") {
                    const b = JSON.parse(raw.toString());
                    if (b.type === "user" && !b.emailAddress) return fail(400, "invalid", "The emailAddress field is required.");
                    const perm = { kind: "drive#permission", id: randomBytes(4).toString("hex"), ...b };
                    f.permissions.push(perm);
                    return send(200, { id: perm.id, type: perm.type, kind: perm.kind, role: perm.role });
                }
                if (req.method === "DELETE") { f.permissions = f.permissions.filter((x) => x.id !== p[5]); return send(204); }
                return send(200, { permissions: f.permissions });
            }
            if (req.method === "DELETE") { files.delete(id); return send(204); }
            if (req.method === "PATCH") {
                if (q.get("addParents")) f.parents = [...f.parents.filter((x) => x !== q.get("removeParents")), q.get("addParents")];
                return send(200, shape(f, q.get("fields")));
            }
            if (q.get("alt") === "media") {
                if (f.mimeType.startsWith("application/vnd.google-apps.")) return fail(403, "fileNotDownloadable", "Only files with binary content can be downloaded. Use Export with Docs Editors files.");
                res.writeHead(200, { "content-type": f.mimeType }); return res.end(f.body);
            }
            send(200, shape(f, q.get("fields")));
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { GOOGLE_DRIVE_API_URL: `http://127.0.0.1:${port}`, GOOGLE_SERVICE_ACCOUNT_JSON: auth.account },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!auth.stats.granted) return `no token was granted: ${auth.stats.refused[0] ?? "no request"}`;
            if (!stats.multipart || !stats.sessions) return "an upload kind was not used";
            if (!stats.failedPiece || !stats.asked) return "the failed piece was not asked about";
            if (!stats.limited) return "the rate limit was not met";
            return null;
        },
    };
}
