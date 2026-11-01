// Backblaze B2's native API for the backblaze_b2 plugin's test, written from backblaze.com/apidocs:
// GET /b2api/v3/b2_authorize_account with Basic (apiInfo.storageApi: apiUrl, downloadUrl,
// recommendedPartSize, absoluteMinimumPartSize), tokens checked on every call (401 expired_auth_token
// once expired; a fresh upload token for each URL), b2_list_buckets, b2_get_upload_url, an upload
// POST (Content-Length, X-Bz-Content-Sha1 compared with the bytes, X-Bz-File-Name percent-encoded,
// X-Bz-Info-*), a 503 service_unavailable once on busy.txt so that a new URL must be asked for,
// b2_start_large_file, b2_get_upload_part_url, the part POST (X-Bz-Part-Number, every part but the
// last at the minimum size), b2_finish_large_file (partSha1Array checked), b2_cancel_large_file,
// b2_list_unfinished_large_files, b2_list_file_names (prefix, delimiter, startFileName,
// maxFileCount, nextFileName), b2_list_file_versions, b2_hide_file, b2_delete_file_version,
// b2_get_download_authorization, GET /file/:bucket/:name with Authorization in a header or the query,
// Range, x-bz-content-sha1 (`none` for large files), and { status, code, message } errors.
// corrupt.txt is served with a SHA-1 that does not match. /_expire, /_auths and /_stuck are the test's.
//
//   start({ port }) -> { env: { B2_API_URL, B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_ID, B2_BUCKET_NAME }, close(), check() }
import { createServer } from "node:http";
import { createHash } from "node:crypto";

const KEY_ID = "qk-b2-key-id", APP_KEY = "qk-b2-application-key", ACCOUNT = "b2acct1234", BUCKET = "b2bucket1a2b3c", NAME = "photos";
const MIN_PART = 100000;
const sha1 = (b) => createHash("sha1").update(b).digest("hex");

export async function start({ port }) {
    const stats = { auths: 0, uploads: 0, parts: 0, finished: 0, newUrls: 0, shaChecked: 0, lists: 0, renewed: 0 };
    const base = `http://127.0.0.1:${port}`;
    let token = "", n = 0, busyOnce = true;
    const uploadTokens = new Map(), large = new Map(), downloads = new Map();
    const files = [];
    const add = (f) => { const e = { fileId: `4_z${++n}`, uploadTimestamp: 1730000000000 + n, action: "upload", ...f }; files.push(e); return e; };
    add({ fileName: "corrupt.txt", data: Buffer.from("rotted"), contentLength: 6, contentSha1: sha1("not this"), contentType: "text/plain", fileInfo: {} });
    const stuck = { fileId: "4_zstuck", fileName: "half.bin", uploadTimestamp: 1730000000000, parts: [] };
    large.set(stuck.fileId, stuck);
    const view = ({ data, ...f }) => ({ accountId: ACCOUNT, bucketId: BUCKET, ...f });
    const newest = () => { const m = new Map(); for (const f of files) if (!m.has(f.fileName) || m.get(f.fileName).uploadTimestamp < f.uploadTimestamp) m.set(f.fileName, f); return [...m.values()].sort((a, b) => (a.fileName < b.fileName ? -1 : 1)); };
    const err = (status, code, message) => [status, { status, code, message }];
    function api(name, b, req) {
        if (req.headers.authorization !== token) return req.headers.authorization === "EXPIRED" || expiredTokens.has(req.headers.authorization) ? err(401, "expired_auth_token", "Authorization token has expired") : err(401, "bad_auth_token", "Invalid authorization token");
        if (name === "b2_list_buckets") return [200, { buckets: [{ accountId: ACCOUNT, bucketId: BUCKET, bucketName: NAME, bucketType: "allPrivate" }] }];
        if (b.bucketId && b.bucketId !== BUCKET) return err(400, "bad_bucket_id", `Invalid bucketId: ${b.bucketId}`);
        if (name === "b2_get_upload_url" || name === "b2_get_upload_part_url") {
            stats.newUrls++;
            const t = `upload-token-${++n}`;
            uploadTokens.set(t, b.fileId ?? BUCKET);
            return [200, { bucketId: BUCKET, fileId: b.fileId, uploadUrl: `${base}/upload/${name === "b2_get_upload_url" ? "file" : "part"}/${b.fileId ?? BUCKET}`, authorizationToken: t }];
        }
        if (name === "b2_start_large_file") { const f = { fileId: `4_zlarge${++n}`, fileName: b.fileName, contentType: b.contentType, fileInfo: b.fileInfo ?? {}, uploadTimestamp: 1730000000000, parts: [] }; large.set(f.fileId, f); return [200, view({ ...f, parts: undefined, action: "start" })]; }
        if (name === "b2_finish_large_file") {
            const f = large.get(b.fileId);
            if (!f) return err(400, "bad_request", "no such large file");
            const shas = f.parts.map((p) => p.sha);
            if (JSON.stringify(shas) !== JSON.stringify(b.partSha1Array)) return err(400, "bad_request", "Part sha1s do not match");
            f.parts.slice(0, -1).forEach((p, i) => { if (p.data.length < MIN_PART) throw new Error(`part ${i + 1} is too small`); });
            large.delete(b.fileId);
            stats.finished++;
            const data = Buffer.concat(f.parts.map((p) => p.data));
            return [200, view(add({ fileName: f.fileName, data, contentLength: data.length, contentSha1: "none", contentType: f.contentType, fileInfo: f.fileInfo }))];
        }
        if (name === "b2_cancel_large_file") { const f = large.get(b.fileId); if (!f) return err(400, "bad_request", "no such large file"); large.delete(b.fileId); return [200, { accountId: ACCOUNT, bucketId: BUCKET, fileId: f.fileId, fileName: f.fileName }]; }
        if (name === "b2_list_unfinished_large_files") return [200, { files: [...large.values()].map((f) => view({ ...f, parts: undefined })), nextFileId: null }];
        if (name === "b2_list_file_names") {
            stats.lists++;
            let list = newest().filter((f) => f.action === "upload" && f.fileName.startsWith(b.prefix ?? "") && (!b.startFileName || f.fileName >= b.startFileName));
            if (b.delimiter) { const seen = new Map(); for (const f of list) { const rest = f.fileName.slice((b.prefix ?? "").length), i = rest.indexOf(b.delimiter); const nm = i >= 0 ? (b.prefix ?? "") + rest.slice(0, i + 1) : f.fileName; if (!seen.has(nm)) seen.set(nm, i >= 0 ? { fileName: nm, action: "folder" } : f); } list = [...seen.values()]; }
            const size = b.maxFileCount ?? 100;
            return [200, { files: list.slice(0, size).map(view), nextFileName: list[size]?.fileName ?? null }];
        }
        if (name === "b2_list_file_versions") return [200, { files: files.filter((f) => f.fileName.startsWith(b.prefix ?? "")).sort((x, y) => y.uploadTimestamp - x.uploadTimestamp).map(view), nextFileName: null, nextFileId: null }];
        if (name === "b2_hide_file") return [200, view(add({ fileName: b.fileName, action: "hide", contentLength: 0, contentSha1: "none", fileInfo: {} }))];
        if (name === "b2_delete_file_version") {
            const i = files.findIndex((f) => f.fileId === b.fileId && f.fileName === b.fileName);
            if (i < 0) return err(400, "file_not_present", "File not present");
            files.splice(i, 1); return [200, { fileId: b.fileId, fileName: b.fileName }];
        }
        if (name === "b2_get_download_authorization") {
            const t = `dl-token-${++n}`;
            downloads.set(t, b.fileNamePrefix);
            return [200, { bucketId: BUCKET, fileNamePrefix: b.fileNamePrefix, authorizationToken: t }];
        }
        return err(400, "bad_request", `unknown call ${name}`);
    }
    const expiredTokens = new Set();
    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", () => {
            const raw = Buffer.concat(chunks), url = new URL(req.url, base), p = url.pathname;
            const send = (s, v, heads = {}) => { res.writeHead(s, { "content-type": "application/json", ...heads }); res.end(Buffer.isBuffer(v) ? v : JSON.stringify(v)); };
            if (p === "/_expire") { expiredTokens.add(token); token = "not-given-yet"; return send(200, {}); }
            if (p === "/_auths") return send(200, { count: stats.auths });
            if (p === "/_stuck") return send(200, { count: large.size, id: stuck.fileId });
            if (p === "/b2api/v3/b2_authorize_account") {
                if (req.headers.authorization !== `Basic ${Buffer.from(`${KEY_ID}:${APP_KEY}`).toString("base64")}`) return send(401, { status: 401, code: "bad_auth_token", message: "Invalid key" });
                stats.auths++;
                if (expiredTokens.size) stats.renewed++;
                token = `account-token-${++n}`;
                return send(200, { accountId: ACCOUNT, authorizationToken: token, applicationKeyExpirationTimestamp: null, apiInfo: { storageApi: { apiUrl: base, downloadUrl: base, s3ApiUrl: base, recommendedPartSize: 100000000, absoluteMinimumPartSize: MIN_PART, capabilities: ["listBuckets", "readFiles", "writeFiles"], infoType: "storageApi" } } });
            }
            let m = p.match(/^\/b2api\/v3\/(b2_\w+)$/);
            if (m) {
                try { const [s, v] = api(m[1], raw.length ? JSON.parse(raw) : {}, req); return send(s, v); }
                catch (e) { return send(400, { status: 400, code: "bad_request", message: e.message }); }
            }
            m = p.match(/^\/upload\/(file|part)\/(.+)$/);
            if (m) {
                const t = req.headers.authorization;
                if (!uploadTokens.has(t)) return send(401, { status: 401, code: "bad_auth_token", message: "Invalid upload token" });
                uploadTokens.delete(t);
                const name = req.headers["x-bz-file-name"] ? decodeURIComponent(req.headers["x-bz-file-name"]) : null;
                if (m[1] === "file" && name === "busy.txt" && busyOnce) { busyOnce = false; return send(503, { status: 503, code: "service_unavailable", message: "c002_v0001 no tomes available" }); }
                if (Number(req.headers["content-length"]) !== raw.length) return send(400, { status: 400, code: "bad_request", message: "Content-Length mismatch" });
                if (req.headers["x-bz-content-sha1"] !== sha1(raw)) return send(400, { status: 400, code: "bad_request", message: "Sha1 did not match data received" });
                stats.shaChecked++;
                if (m[1] === "part") {
                    const f = large.get(m[2]);
                    if (!f) return send(400, { status: 400, code: "bad_request", message: "no such large file" });
                    const part = Number(req.headers["x-bz-part-number"]);
                    if (part !== f.parts.length + 1) return send(400, { status: 400, code: "bad_request", message: `part ${part} out of order` });
                    f.parts.push({ sha: sha1(raw), data: raw }); stats.parts++;
                    return send(200, { fileId: f.fileId, partNumber: part, contentLength: raw.length, contentSha1: sha1(raw) });
                }
                stats.uploads++;
                const info = Object.fromEntries(Object.entries(req.headers).filter(([k]) => k.startsWith("x-bz-info-")).map(([k, v]) => [k.slice(10), decodeURIComponent(v)]));
                return send(200, view(add({ fileName: name, data: raw, contentLength: raw.length, contentSha1: sha1(raw), contentType: req.headers["content-type"], fileInfo: info })));
            }
            m = p.match(/^\/file\/([^/]+)\/(.+)$/);
            if (m) {
                const name = decodeURIComponent(m[2]), given = req.headers.authorization ?? url.searchParams.get("Authorization");
                const prefix = downloads.get(given);
                if (given !== token && prefix == null) return send(401, expiredTokens.has(given) ? { status: 401, code: "expired_auth_token", message: "expired" } : { status: 401, code: "bad_auth_token", message: "Invalid token" });
                if (prefix != null && !name.startsWith(prefix)) return send(401, { status: 401, code: "download_cap_exceeded", message: `not entitled: token covers ${prefix} only` });
                if (m[1] !== NAME) return send(404, { status: 404, code: "not_found", message: "bucket not found" });
                const f = newest().find((x) => x.fileName === name);
                if (!f || f.action !== "upload") return send(404, { status: 404, code: "not_found", message: `file not found: ${name}` });
                const heads = { "content-type": f.contentType, "x-bz-file-id": f.fileId, "x-bz-file-name": encodeURIComponent(name), "x-bz-content-sha1": f.contentSha1, ...Object.fromEntries(Object.entries(f.fileInfo).map(([k, v]) => [`x-bz-info-${k}`, v])) };
                const r = (req.headers.range ?? "").match(/^bytes=(\d+)-(\d+)$/);
                if (r) return send(206, f.data.subarray(Number(r[1]), Number(r[2]) + 1), { ...heads, "content-range": `bytes ${r[1]}-${r[2]}/${f.data.length}` });
                return send(200, f.data, heads);
            }
            send(404, { status: 404, code: "not_found", message: "no such path" });
        });
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { B2_API_URL: base, B2_APPLICATION_KEY_ID: KEY_ID, B2_APPLICATION_KEY: APP_KEY, B2_BUCKET_ID: BUCKET, B2_BUCKET_NAME: NAME },
        close() { server.close(); server.closeAllConnections?.(); },
        check: () => (!stats.uploads ? "nothing was uploaded" : !stats.finished ? "no large file was finished" : stats.parts < 3 ? "too few parts came" : !stats.renewed ? "the token was never renewed" : null),
    };
}
