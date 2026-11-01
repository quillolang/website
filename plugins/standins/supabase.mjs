// A Supabase project for the supabase plugin's test, written from PostgREST's API reference, the
// GoTrue (Auth) API and the Storage API. /rest/v1 reads filters (eq, neq, gt, gte, lt, lte, like,
// ilike, is, in with quoted values, not., and or=()), select, order, limit, offset, Prefer count=exact
// with Content-Range, return=representation, resolution=merge-duplicates and on_conflict, and gives
// PostgREST's { code, message, details, hint } (23505, PGRST205, 42703). A JWT is required: the
// service key sees all rows, a user's token only its own, as row level security would. /auth/v1
// signs real HS256 JWTs with `aud: authenticated`, refresh tokens work once, and sign-out ends them.
// /storage/v1 keeps files; object/sign gives a { signedURL } whose JWT token the GET checks.
import { createServer } from "node:http";
import { createHmac, randomBytes, randomUUID } from "node:crypto";

const SERVICE = "standin-supabase-service-key", SECRET = "standin-jwt-secret-with-at-least-32-chars";
const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
const sign = (claims) => { const t = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}`; return `${t}.${createHmac("sha256", SECRET).update(t).digest("base64url")}`; };
function verify(token) {
    const [h, p, s] = (token ?? "").split(".");
    if (!s || createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url") !== s) return null;
    const c = JSON.parse(Buffer.from(p, "base64url"));
    return c.exp * 1000 < Date.now() ? null : c;
}
function listItems(text) {
    const out = []; let i = 0;
    while (i < text.length) {
        if (text[i] === '"') { let v = ""; i++; while (text[i] !== '"') { if (text[i] === "\\") i++; v += text[i++]; } out.push(v); i += 2; }
        else { const e = text.indexOf(",", i); const end = e < 0 ? text.length : e; out.push(text.slice(i, end)); i = end + 1; }
    }
    return out;
}
function test(row, col, expr) {
    const not = expr.startsWith("not."); if (not) expr = expr.slice(4);
    const dot = expr.indexOf("."), op = expr.slice(0, dot), val = expr.slice(dot + 1), have = row[col];
    let r;
    const n = (x) => (typeof have === "number" ? Number(x) : x);
    switch (op) {
        case "eq": r = have === n(val); break; case "neq": r = have !== n(val); break;
        case "gt": r = have > n(val); break; case "gte": r = have >= n(val); break;
        case "lt": r = have < n(val); break; case "lte": r = have <= n(val); break;
        case "like": case "ilike": r = new RegExp("^" + val.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", op === "ilike" ? "i" : "").test(String(have)); break;
        case "is": r = val === "null" ? have === null || have === undefined : have === (val === "true"); break;
        case "in": r = listItems(val.slice(1, -1)).map(n).includes(have); break;
        default: throw { status: 400, code: "PGRST100", message: `failed to parse filter (${expr})`, details: `unexpected "${op}"`, hint: null };
    }
    return not ? !r : r;
}

export async function start({ port }) {
    const stats = { selects: 0, signed: 0, storageGets: 0, rls: 0 };
    let nextId = 5;
    const ADA = randomUUID();
    let todos = [
        { id: 1, title: "Buy milk, eggs", done: false, priority: 1, note: null, owner: ADA },
        { id: 2, title: "Call (Ada)", done: false, priority: 3, note: "phone", owner: "other" },
        { id: 3, title: "File taxes", done: true, priority: 2, note: null, owner: ADA },
        { id: 4, title: "Paint", done: false, priority: 2, note: "red", owner: "other" },
    ];
    const refresh = new Map(), files = new Map();
    function session(user) {
        const now = Math.floor(Date.now() / 1000);
        const r = randomBytes(9).toString("hex");
        refresh.set(r, user);
        return { access_token: sign({ sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600 }), token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: r, user };
    }
    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", () => {
            const url = new URL(req.url, "http://x");
            const raw = Buffer.concat(chunks);
            const send = (code, v, h = {}) => { res.writeHead(code, { "content-type": "application/json", ...h }); res.end(v === undefined ? "" : JSON.stringify(v)); };
            const path = decodeURIComponent(url.pathname);
            const signedGet = /^\/storage\/v1\/object\/sign\//.test(path) && req.method === "GET";
            if (req.headers.apikey !== SERVICE && !signedGet) return send(401, { message: "Invalid API key", hint: "Double check your Supabase `anon` or `service_role` API key." });
            const bearer = (req.headers.authorization ?? "").replace(/^Bearer /, "");
            const user = bearer === SERVICE ? null : verify(bearer);
            const json = chunks.length && /json/.test(req.headers["content-type"] ?? "") ? JSON.parse(raw.toString()) : null;
            try {
                if (path === "/auth/v1/token") {
                    const grant = url.searchParams.get("grant_type");
                    if (grant === "password") {
                        if (json?.email === "ada@example.com" && json.password === "correct horse") return send(200, session({ id: ADA, aud: "authenticated", role: "authenticated", email: json.email }));
                        return send(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
                    }
                    if (grant === "refresh_token") {
                        const u = refresh.get(json?.refresh_token);
                        if (!u) return send(400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" });
                        refresh.delete(json.refresh_token);
                        return send(200, session(u));
                    }
                    return send(400, { code: 400, error_code: "unsupported_grant_type", msg: "unsupported_grant_type" });
                }
                if (path === "/auth/v1/user") { if (!user) return send(401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" }); return send(200, { id: user.sub, email: user.email, aud: user.aud, role: user.role }); }
                if (path === "/auth/v1/logout") { for (const [k, v] of refresh) if (v.id === user?.sub) refresh.delete(k); return send(204); }
                if (path === "/rest/v1/rpc/count_todos") return send(200, todos.filter((t) => t.done === json.done).length);
                if (path.startsWith("/rest/v1/")) {
                    const table = path.slice(9);
                    if (table !== "todos") return send(404, { code: "PGRST205", details: null, hint: "Perhaps you meant the table 'public.todos'", message: `Could not find the table 'public.${table}' in the schema cache` });
                    const skip = ["select", "order", "limit", "offset", "on_conflict"];
                    const pass = (t) => { for (const [k, v] of url.searchParams) { if (skip.includes(k)) continue; if (k === "or") { if (!listOr(v).some(([c, e]) => test(t, c, e))) return false; continue; } if (!test(t, k, v)) return false; } return true; };
                    const visible = user ? todos.filter((t) => t.owner === user.sub) : todos;
                    if (user) stats.rls++;
                    const prefer = req.headers.prefer ?? "";
                    const shape = (t) => { const s = url.searchParams.get("select"); if (!s || s === "*") return t; return Object.fromEntries(s.split(",").map((c) => [c, t[c]])); };
                    if (req.method === "GET") {
                        stats.selects++;
                        let rows = visible.filter(pass);
                        const total = rows.length;
                        const o = url.searchParams.get("order");
                        if (o) { const [c, d] = o.split("."); rows = [...rows].sort((a, b) => (a[c] < b[c] ? -1 : 1) * (d === "desc" ? -1 : 1)); }
                        const off = Number(url.searchParams.get("offset") ?? 0), lim = url.searchParams.get("limit");
                        rows = rows.slice(off, lim ? off + Number(lim) : undefined);
                        const range = rows.length ? `${off}-${off + rows.length - 1}` : "*";
                        return send(200, rows.map(shape), { "content-range": `${range}/${/count=exact/.test(prefer) ? total : "*"}` });
                    }
                    if (req.method === "POST") {
                        const list = Array.isArray(json) ? json : [json], out = [];
                        for (const r of list) {
                            const had = todos.find((t) => t.id === r.id);
                            if (had && /merge-duplicates/.test(prefer)) { Object.assign(had, r); out.push(had); continue; }
                            if (had) return send(409, { code: "23505", details: `Key (id)=(${r.id}) already exists.`, hint: null, message: 'duplicate key value violates unique constraint "todos_pkey"' });
                            const row = { id: nextId++, done: false, note: null, owner: "other", ...r };
                            todos.push(row); out.push(row);
                        }
                        return send(201, /return=representation/.test(prefer) ? out : undefined);
                    }
                    if (req.method === "PATCH") { const hit = visible.filter(pass); hit.forEach((t) => Object.assign(t, json)); return send(200, hit); }
                    if (req.method === "DELETE") { const hit = visible.filter(pass); todos = todos.filter((t) => !hit.includes(t)); return send(200, hit); }
                }
                const so = /^\/storage\/v1\/object\/(upload\/sign\/|sign\/|)([^/]+)(?:\/(.*))?$/.exec(path);
                if (so) {
                    const [, kind, bucket, key] = so, id = `${bucket}/${key}`;
                    if (kind === "" && req.method === "POST") {
                        if (files.has(id) && req.headers["x-upsert"] !== "true") return send(400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
                        files.set(id, { body: raw, type: req.headers["content-type"] });
                        return send(200, { Key: id, Id: randomUUID() });
                    }
                    if (kind === "" && req.method === "DELETE") { const gone = []; for (const p of json.prefixes) if (files.delete(`${bucket}/${p}`)) gone.push({ name: p, bucket_id: bucket }); return send(200, gone); }
                    if (kind === "sign/" && req.method === "POST") {
                        if (!files.has(id)) return send(400, { statusCode: "404", error: "not_found", message: "Object not found" });
                        const token = sign({ url: id, exp: Math.floor(Date.now() / 1000) + json.expiresIn });
                        stats.signed++;
                        return send(200, { signedURL: `/object/sign/${encodeURI(id)}?token=${token}` });
                    }
                    if (kind === "sign/" && req.method === "GET") {
                        const c = verify(url.searchParams.get("token"));
                        if (!c || c.url !== id) return send(400, { statusCode: "400", error: "InvalidSignature", message: "The signature is invalid" });
                        stats.storageGets++;
                        res.writeHead(200, { "content-type": files.get(id).type });
                        return res.end(files.get(id).body);
                    }
                    if (kind === "upload/sign/") return send(200, { url: `/object/upload/sign/${encodeURI(id)}?token=upl`, token: "upl" });
                }
                send(404, { message: "not found" });
            } catch (e) {
                if (e.status) return send(e.status, { code: e.code, message: e.message, details: e.details, hint: e.hint });
                send(500, { message: String(e) });
            }
        });
    });
    function listOr(v) { return v.slice(1, -1).split(",").map((p) => { const i = p.indexOf("."); return [p.slice(0, i), p.slice(i + 1)]; }); }
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { SUPABASE_API_URL: `http://127.0.0.1:${port}`, SUPABASE_API_KEY: SERVICE, SUPABASE_JWT_SECRET: SECRET },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.selects) return "the Supabase stand-in got no select";
            if (!stats.rls) return "no request came as a signed-in user";
            if (!stats.storageGets) return "the signed link was not followed";
            return null;
        },
    };
}
