// A WebDAV server for the webdav plugin's example, written from RFC 4918 (HTTP Extensions for
// WebDAV, classes 1 and 2), with files kept in memory under /dav/.
//
// Basic auth (ada / s3cret) or a bearer token (dav-token); anything else is 401. OPTIONS says
// DAV: 1, 2. PROPFIND (Depth 0 or 1; infinity is refused with propfind-finite-depth, as servers
// may) answers 207 with allprop or the named properties (unknown ones in a 404 propstat).
// GET/HEAD, PUT (201 or 204, 409 without a parent, If-Match and If-None-Match), MKCOL (405 when
// something is there, 409 without a parent, 415 with a body), DELETE, COPY and MOVE (Destination,
// Overwrite, 412, 201 or 204), and LOCK/UNLOCK (exclusive or shared write locks with tokens and
// timeouts; a locked resource refuses PUT, DELETE and MOVE with 423 unless the If header has its
// token; LOCK on nothing makes an empty file).
import { createServer } from "node:http";
import { randomUUID, createHash } from "node:crypto";

const xmlEsc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const hrefOf = (path) => path.split("/").map(encodeURIComponent).join("/");

// Just enough XML to read propfind and lockinfo bodies: element names in DAV: and others.
function elements(xml) {
    const ns = { d: "DAV:" };
    for (const m of xml.matchAll(/xmlns(?::(\w+))?="([^"]*)"/g)) ns[m[1] ?? ""] = m[2];
    return [...xml.matchAll(/<([\w.-]+:)?([\w.-]+)[^>]*?(\/?)>/g)]
        .filter((m) => !m[0].startsWith("</") && !m[0].startsWith("<?"))
        .map((m) => ({ ns: ns[(m[1] ?? "").slice(0, -1)] ?? ns[""] ?? "", name: m[2] }));
}

export async function start({ port }) {
    const base = `http://127.0.0.1:${port}`;
    const now = () => new Date();
    // path (no trailing slash; "/dav" is the root collection) -> { dir, body, type, modified, created, etag }
    const files = new Map([["/dav", { dir: true, created: now(), modified: now() }]]);
    const locks = new Map(); // path -> { token, scope, owner, depth, expires }
    const seen = { methods: [], unauthorized: 0, lockedRefused: 0, tokenUsed: 0 };

    const norm = (p) => { let d = decodeURIComponent(p); while (d.length > 1 && d.endsWith("/")) d = d.slice(0, -1); return d; };
    const parent = (p) => p.slice(0, p.lastIndexOf("/")) || "/";
    const children = (p) => [...files.keys()].filter((k) => k !== p && parent(k) === p).sort();
    const descendants = (p) => [...files.keys()].filter((k) => k === p || k.startsWith(p + "/"));
    const etag = (body) => `"${createHash("sha1").update(body).digest("hex").slice(0, 16)}"`;

    function lockOn(path) {
        // A lock on this resource, or a depth-infinity lock on a collection above it.
        for (const [p, l] of locks) {
            if (l.expires < Date.now()) { locks.delete(p); continue; }
            if (p === path || (l.depth === "infinity" && path.startsWith(p + "/"))) return l;
        }
        return null;
    }
    const tokensIn = (req) => [...(req.headers.if ?? "").matchAll(/<([^>]+)>/g)].map((m) => m[1]);
    function locked(req, path) {
        const l = lockOn(path);
        if (!l) return false;
        if (tokensIn(req).includes(l.token)) { seen.tokenUsed++; return false; }
        seen.lockedRefused++;
        return true;
    }

    const LIVE = ["resourcetype", "getcontentlength", "getlastmodified", "creationdate", "getetag", "getcontenttype", "displayname", "supportedlock", "lockdiscovery"];
    function prop(path, f, name) {
        const lock = lockOn(path);
        switch (name) {
            case "resourcetype": return f.dir ? "<d:collection/>" : "";
            case "getcontentlength": return f.dir ? null : String(f.body.length);
            case "getlastmodified": return f.modified.toUTCString();
            case "creationdate": return f.created.toISOString().replace(/\.\d+Z$/, "Z");
            case "getetag": return f.dir ? null : f.etag;
            case "getcontenttype": return f.dir ? null : xmlEsc(f.type);
            case "displayname": return xmlEsc(path.split("/").pop());
            case "supportedlock": return "<d:lockentry><d:lockscope><d:exclusive/></d:lockscope><d:locktype><d:write/></d:locktype></d:lockentry><d:lockentry><d:lockscope><d:shared/></d:lockscope><d:locktype><d:write/></d:locktype></d:lockentry>";
            case "lockdiscovery": return lock ? activelock(lock) : "";
            default: return null;
        }
    }
    const activelock = (l) => `<d:activelock><d:locktype><d:write/></d:locktype><d:lockscope><d:${l.scope}/></d:lockscope><d:depth>${l.depth}</d:depth>${l.owner ? `<d:owner>${xmlEsc(l.owner)}</d:owner>` : ""}<d:timeout>Second-${Math.max(0, Math.round((l.expires - Date.now()) / 1000))}</d:timeout><d:locktoken><d:href>${l.token}</d:href></d:locktoken><d:lockroot><d:href>${hrefOf(l.root)}</d:href></d:lockroot></d:activelock>`;

    function propfind(path, depth, body) {
        const wanted = elements(body);
        const allprop = body.trim() === "" || wanted.some((e) => e.ns === "DAV:" && e.name === "allprop");
        const names = allprop ? LIVE.map((n) => ({ ns: "DAV:", name: n })) : wanted.filter((e) => !(e.ns === "DAV:" && ["propfind", "prop"].includes(e.name)));
        const targets = depth === "0" ? [path] : [path, ...(files.get(path).dir ? children(path) : [])];
        const resp = targets.map((p) => {
            const f = files.get(p);
            const ok = [], missing = [];
            names.forEach((n, i) => {
                const v = n.ns === "DAV:" ? prop(p, f, n.name) : null;
                const tag = n.ns === "DAV:" ? `d:${n.name}` : `x${i}:${n.name}`;
                const decl = n.ns === "DAV:" ? "" : ` xmlns:x${i}="${xmlEsc(n.ns)}"`;
                if (v === null) { if (!allprop) missing.push(`<${tag}${decl}/>`); }
                else ok.push(v === "" ? `<${tag}${decl}/>` : `<${tag}${decl}>${v}</${tag}>`);
            });
            return `<d:response><d:href>${hrefOf(p)}${f.dir ? "/" : ""}</d:href>`
                + (ok.length ? `<d:propstat><d:prop>${ok.join("")}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>` : "")
                + (missing.length ? `<d:propstat><d:prop>${missing.join("")}</d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>` : "")
                + `</d:response>`;
        });
        return `<?xml version="1.0" encoding="utf-8"?>\n<d:multistatus xmlns:d="DAV:">${resp.join("")}</d:multistatus>`;
    }

    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", () => {
            const body = Buffer.concat(chunks);
            const send = (status, text = "", headers = {}) => { res.writeHead(status, headers); res.end(text); };
            const xml = (status, text, headers = {}) => send(status, text, { "content-type": "application/xml; charset=utf-8", ...headers });
            const auth = req.headers.authorization ?? "";
            const okAuth = auth === `Basic ${Buffer.from("ada:s3cret").toString("base64")}` || auth === "Bearer dav-token";
            if (!okAuth) { seen.unauthorized++; return send(401, "", { "www-authenticate": 'Basic realm="dav"' }); }
            const url = new URL(req.url, base);
            const path = norm(url.pathname);
            if (path !== "/dav" && !path.startsWith("/dav/")) return send(404);
            seen.methods.push(req.method);
            const f = files.get(path);
            switch (req.method) {
                case "OPTIONS": return send(200, "", { dav: "1, 2", allow: "OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, MKCOL, COPY, MOVE, LOCK, UNLOCK", "ms-author-via": "DAV" });
                case "PROPFIND": {
                    if (!f) return send(404);
                    const depth = req.headers.depth ?? "infinity";
                    if (depth === "infinity") return xml(403, '<?xml version="1.0" encoding="utf-8"?>\n<d:error xmlns:d="DAV:"><d:propfind-finite-depth/></d:error>');
                    if (depth !== "0" && depth !== "1") return send(400);
                    return xml(207, propfind(path, depth, body.toString()));
                }
                case "GET": case "HEAD":
                    if (!f) return send(404);
                    if (f.dir) return send(405, "", { allow: "PROPFIND, MKCOL, DELETE" });
                    return send(200, req.method === "HEAD" ? "" : f.body, { "content-type": f.type, etag: f.etag, "last-modified": f.modified.toUTCString() });
                case "PUT": {
                    if (f?.dir) return send(405);
                    if (!files.get(parent(path))?.dir) return send(409);
                    if (locked(req, path)) return xml(423, '<?xml version="1.0" encoding="utf-8"?>\n<d:error xmlns:d="DAV:"><d:lock-token-submitted/></d:error>');
                    if (req.headers["if-none-match"] === "*" && f) return send(412);
                    const im = req.headers["if-match"];
                    if (im && (!f || (im !== "*" && im !== f.etag))) return send(412);
                    files.set(path, { dir: false, body, type: req.headers["content-type"] ?? "application/octet-stream", created: f?.created ?? now(), modified: now(), etag: etag(body) });
                    return send(f ? 204 : 201, "", { etag: etag(body) });
                }
                case "MKCOL":
                    if (body.length) return send(415);
                    if (f) return send(405);
                    if (!files.get(parent(path))?.dir) return send(409);
                    if (locked(req, parent(path))) return send(423);
                    files.set(path, { dir: true, created: now(), modified: now() });
                    return send(201);
                case "DELETE":
                    if (!f) return send(404);
                    if (path === "/dav") return send(403);
                    for (const p of descendants(path)) if (locked(req, p)) return send(423);
                    for (const p of descendants(path)) { files.delete(p); locks.delete(p); }
                    return send(204);
                case "COPY": case "MOVE": {
                    if (!f) return send(404);
                    let dest;
                    try { dest = new URL(req.headers.destination); } catch { return send(400); }
                    if (dest.host !== url.host) return send(502);
                    const to = norm(dest.pathname);
                    if (!to.startsWith("/dav/") || to === path || to.startsWith(path + "/")) return send(403);
                    if (!files.get(parent(to))?.dir) return send(409);
                    const existed = files.has(to);
                    if (existed && (req.headers.overwrite ?? "T") === "F") return send(412);
                    if (req.method === "MOVE") for (const p of descendants(path)) if (locked(req, p)) return send(423);
                    if (locked(req, to)) return send(423);
                    for (const p of descendants(to)) files.delete(p);
                    for (const p of descendants(path)) {
                        const g = files.get(p);
                        files.set(to + p.slice(path.length), { ...g, modified: req.method === "COPY" ? now() : g.modified });
                        if (req.method === "MOVE") { files.delete(p); locks.delete(p); }
                    }
                    return send(existed ? 204 : 201);
                }
                case "LOCK": {
                    const secs = Math.min(3600, Number(/Second-(\d+)/i.exec(req.headers.timeout ?? "")?.[1] ?? 600));
                    if (body.length === 0) {
                        // A refresh: the If header names the lock.
                        const l = lockOn(path);
                        if (!l || !tokensIn(req).includes(l.token)) return send(412);
                        l.expires = Date.now() + secs * 1000;
                        return xml(200, `<?xml version="1.0" encoding="utf-8"?>\n<d:prop xmlns:d="DAV:"><d:lockdiscovery>${activelock(l)}</d:lockdiscovery></d:prop>`);
                    }
                    const info = body.toString();
                    const scope = /<(?:\w+:)?shared\s*\/>/.test(info) ? "shared" : "exclusive";
                    const owner = /<(?:\w+:)?owner[^>]*>([\s\S]*?)<\/(?:\w+:)?owner>/.exec(info)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
                    const existing = lockOn(path);
                    if (existing && (existing.scope === "exclusive" || scope === "exclusive")) return xml(423, '<?xml version="1.0" encoding="utf-8"?>\n<d:error xmlns:d="DAV:"><d:no-conflicting-lock/></d:error>');
                    let created = false;
                    if (!f) {
                        if (!files.get(parent(path))?.dir) return send(409);
                        files.set(path, { dir: false, body: Buffer.alloc(0), type: "application/octet-stream", created: now(), modified: now(), etag: etag(Buffer.alloc(0)) });
                        created = true;
                    }
                    const l = { token: `urn:uuid:${randomUUID()}`, scope, owner, depth: req.headers.depth === "0" ? "0" : "infinity", expires: Date.now() + secs * 1000, root: path };
                    locks.set(path, l);
                    return xml(created ? 201 : 200, `<?xml version="1.0" encoding="utf-8"?>\n<d:prop xmlns:d="DAV:"><d:lockdiscovery>${activelock(l)}</d:lockdiscovery></d:prop>`, { "lock-token": `<${l.token}>` });
                }
                case "UNLOCK": {
                    const t = /<([^>]+)>/.exec(req.headers["lock-token"] ?? "")?.[1];
                    const l = locks.get(path);
                    if (!t) return send(400);
                    if (!l || l.token !== t) return xml(409, '<?xml version="1.0" encoding="utf-8"?>\n<d:error xmlns:d="DAV:"><d:lock-token-matches-request-uri/></d:error>');
                    locks.delete(path);
                    return send(204);
                }
                default: return send(405);
            }
        });
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { WEBDAV_URL: `${base}/dav/`, WEBDAV_USER: "ada", WEBDAV_PASSWORD: "s3cret" },
        close() { server.close(); },
        check() {
            for (const m of ["PROPFIND", "PUT", "GET", "MKCOL", "MOVE", "COPY", "DELETE", "LOCK", "UNLOCK"]) if (!seen.methods.includes(m)) return `the WebDAV server got no ${m}`;
            if (!seen.lockedRefused) return "no write was refused for a lock (423)";
            if (!seen.tokenUsed) return "no write came with the lock's token";
            return null;
        },
        seen, files,
    };
}
