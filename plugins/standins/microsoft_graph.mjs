// Microsoft Graph for the microsoft_graph plugin's test, written from Microsoft's documentation:
// "Get access without a user" (POST /:tenant/oauth2/v2.0/token, grant_type=client_credentials, scope
// ending in /.default, AADSTS errors), "Paging" (@odata.nextLink as a full address), "Throttling"
// (429 with Retry-After, given once), sendMail (202), messages, calendarView (Prefer: outlook.timezone),
// events, driveItem path addressing, /content with a 302 to a short-lived address, where an
// Authorization header is counted as a leaked token, createUploadSession with
// nextExpectedRanges, and $batch. Errors are { error: { code, message, innerError } }.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const TENANT = "11111111-2222-3333-4444-555555555555", CLIENT = "standin-client", SECRET = "standin-graph-secret";

export async function start({ port }) {
    const stats = { tokens: 0, throttled: 0, pages: 0, sent: [], redirects: 0, leaked: 0, sessions: 0 };
    let token = null, calls = 0;
    const users = Array.from({ length: 230 }, (_, i) => ({ id: `u${i}`, displayName: `User ${i}` }));
    const mail = Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, subject: `Message ${i}`, from: { emailAddress: { address: i === 3 ? "o'neil@contoso.example" : "x@contoso.example" } }, receivedDateTime: `2026-10-${String(30 - i).padStart(2, "0")}T00:00:00Z` }));
    const events = [{ id: "e1", subject: "Standup", start: { dateTime: "2026-11-03T09:00:00.0000000", timeZone: "UTC" }, end: { dateTime: "2026-11-03T09:15:00.0000000", timeZone: "UTC" } }];
    const files = new Map(), links = new Map(), sessions = new Map();
    const base = `http://127.0.0.1:${port}/v1.0`;
    const item = (path, b) => ({ id: path, name: path.split("/").pop(), size: b.length, file: { mimeType: "text/plain" } });
    const pageOf = (list, url, send) => {
        const top = Number(url.searchParams.get("$top") ?? 100), skip = Number(url.searchParams.get("$skip") ?? 0);
        if (skip) stats.pages++;
        const next = new URL(url); next.searchParams.set("$skip", String(skip + top));
        send(200, { "@odata.context": `${base}/$metadata#users`, value: list.slice(skip, skip + top), ...(skip + top < list.length ? { "@odata.nextLink": `http://127.0.0.1:${port}${next.pathname}${next.search}` } : {}) });
    };
    const gerr = (code, message) => ({ error: { code, message, innerError: { date: "2026-11-01T10:00:00", "request-id": "standin", "client-request-id": "standin" } } });
    function route(method, path, url, json, raw, headers, send, res) {
        const m = /^\/users\/([^/]+)(\/.*)?$/.exec(path);
        if (path === "/users") return pageOf(users, url, send);
        if (!m) return send(404, gerr("Request_ResourceNotFound", `Resource not found for the segment '${path}'.`));
        const who = m[1], rest = m[2] ?? "";
        if (who.startsWith("nobody")) return send(404, gerr("Request_ResourceNotFound", `Resource '${who}' does not exist or one of its queried reference-property objects are not present.`));
        if (!rest) return send(200, { id: who, displayName: "Ada Lovelace", mail: who });
        if (rest === "/sendMail") {
            const msg = json?.message;
            if (!msg?.toRecipients?.length) return send(400, gerr("ErrorInvalidRecipients", "At least one recipient is not valid."));
            stats.sent.push(msg);
            return send(202);
        }
        if (/\/messages$/.test(rest)) {
            let list = mail;
            const f = url.searchParams.get("$filter");
            if (f) { const q = /eq '((?:[^']|'')*)'/.exec(f); if (!q) return send(400, gerr("BadRequest", "Invalid filter clause")); const want = q[1].replace(/''/g, "'"); list = mail.filter((x) => x.from.emailAddress.address === want); }
            return pageOf(list, url, send);
        }
        if (rest === "/calendarView") {
            if (!url.searchParams.get("startDateTime") || !url.searchParams.get("endDateTime")) return send(400, gerr("ErrorInvalidParameter", "This request requires a time window"));
            if (headers.prefer !== 'outlook.timezone="UTC"') return send(400, gerr("BadRequest", "The stand-in expects the UTC preference"));
            return pageOf(events, url, send);
        }
        if (rest === "/events") {
            const e = { id: "e" + (events.length + 1), ...json };
            if (json.isOnlineMeeting) e.onlineMeeting = { joinUrl: "https://teams.example/join/1" };
            events.unshift(e);
            return send(201, e);
        }
        const d = /^\/drive\/root(?::\/(.*?):?)?(\/children|\/content|\/createUploadSession)?$/.exec(rest);
        if (d) {
            const p = (d[1] ?? "").replace(/:$/, ""), tail = d[2] ?? "";
            if (tail === "/content" && method === "PUT") { files.set(p, raw); return send(201, item(p, raw)); }
            if (tail === "/content") {
                if (!files.has(p)) return send(404, gerr("itemNotFound", "The resource could not be found."));
                const id = randomBytes(6).toString("hex");
                links.set(id, files.get(p)); stats.redirects++;
                res.writeHead(302, { location: `http://127.0.0.1:${port}/download/${id}` });
                return res.end();
            }
            if (tail === "/children") {
                const inside = [...files.keys()].filter((f) => f.startsWith(p + "/")).sort();
                return pageOf(inside.map((f) => item(f, files.get(f))), url, send);
            }
            if (tail === "/createUploadSession") {
                const id = randomBytes(6).toString("hex");
                sessions.set(id, { path: p, have: Buffer.alloc(0) }); stats.sessions++;
                return send(200, { uploadUrl: `http://127.0.0.1:${port}/session/${id}`, expirationDateTime: "2026-11-02T00:00:00Z" });
            }
            return files.has(p) ? send(200, item(p, files.get(p))) : send(404, gerr("itemNotFound", "The resource could not be found."));
        }
        send(400, gerr("BadRequest", `Unsupported ${path}`));
    }
    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", () => {
            const url = new URL(req.url, "http://x");
            const raw = Buffer.concat(chunks);
            const send = (code, v, h = {}) => { res.writeHead(code, { "content-type": "application/json", ...h }); res.end(v === undefined ? "" : JSON.stringify(v)); };
            if (url.pathname === `/${TENANT}/oauth2/v2.0/token`) {
                const f = new URLSearchParams(raw.toString());
                if (f.get("grant_type") !== "client_credentials") return send(400, { error: "unsupported_grant_type", error_description: "AADSTS70003" });
                if (f.get("client_id") !== CLIENT || f.get("client_secret") !== SECRET) return send(401, { error: "invalid_client", error_description: "AADSTS7000215: Invalid client secret provided." });
                if (f.get("scope") !== "https://graph.microsoft.com/.default") return send(400, { error: "invalid_scope", error_description: "AADSTS70011: The provided value for scope is not valid." });
                token = "eyJ0.standin." + randomBytes(8).toString("hex"); stats.tokens++;
                return send(200, { token_type: "Bearer", expires_in: 3599, ext_expires_in: 3599, access_token: token });
            }
            const dl = /^\/download\/(.+)$/.exec(url.pathname);
            if (dl) { if (req.headers.authorization) stats.leaked++; res.writeHead(200, { "content-type": "text/plain" }); return res.end(links.get(dl[1])); }
            const se = /^\/session\/(.+)$/.exec(url.pathname);
            if (se) {
                if (req.headers.authorization) stats.leaked++;
                const s = sessions.get(se[1]);
                if (!s) return send(404, gerr("itemNotFound", "The upload session was not found."));
                const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(req.headers["content-range"] ?? "");
                if (!m) return send(400, gerr("invalidRange", "Bad Content-Range"));
                const [a, b, total] = m.slice(1).map(Number);
                if (a !== s.have.length) return send(416, gerr("invalidRange", "The fragment is out of order"));
                s.have = Buffer.concat([s.have, raw]);
                if (b + 1 < total) return send(202, { expirationDateTime: "2026-11-02T00:00:00Z", nextExpectedRanges: [`${b + 1}-`] });
                files.set(s.path, s.have); sessions.delete(se[1]);
                return send(201, item(s.path, s.have));
            }
            if (req.headers.authorization !== `Bearer ${token}`) return send(401, gerr("InvalidAuthenticationToken", "Access token is empty."));
            const path = decodeURIComponent(url.pathname).replace(/^\/v1\.0/, "");
            calls++;
            if (calls === 8 && !stats.throttled) { stats.throttled++; return send(429, gerr("TooManyRequests", "Too many requests"), { "retry-after": "1" }); }
            const json = raw.length && /json/.test(req.headers["content-type"] ?? "") ? JSON.parse(raw.toString()) : null;
            if (path === "/$batch") {
                const responses = [];
                let pending = json.requests.length;
                for (const r of json.requests) {
                    const u = new URL(r.url, "http://x");
                    route(r.method, decodeURIComponent(u.pathname), u, r.body, null, {}, (code, v) => { responses.push({ id: r.id, status: code, body: v }); if (--pending === 0) send(200, { responses: responses.reverse() }); }, null);
                }
                return;
            }
            route(req.method, path, url, json, raw, req.headers, send, res);
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { MSGRAPH_API_URL: base, MSGRAPH_LOGIN_URL: `http://127.0.0.1:${port}`, MSGRAPH_TENANT_ID: TENANT, MSGRAPH_CLIENT_ID: CLIENT, MSGRAPH_CLIENT_SECRET: SECRET },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (stats.tokens !== 1) return `${stats.tokens} tokens were asked for, not 1`;
            if (!stats.throttled) return "the 429 was not met";
            if (!stats.pages) return "no @odata.nextLink was followed";
            if (!stats.sent.length) return "no mail was sent";
            if (!stats.redirects) return "no download was redirected";
            if (stats.leaked) return `the token went to a pre-authenticated address ${stats.leaked} times`;
            if (!stats.sessions) return "no upload session was used";
            return null;
        },
    };
}
