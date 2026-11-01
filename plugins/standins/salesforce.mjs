// A Salesforce org for the salesforce plugin's test, written from Salesforce's REST API Developer
// Guide, "OAuth 2.0 Client Credentials Flow" and "OAuth 2.0 JWT Bearer Flow": POST
// /services/oauth2/token, the JWT's RS256 signature, iss, sub, aud and an exp at most 3 minutes
// away checked, giving access_token and instance_url; /services/data/vXX.X/query and queryAll by a
// small SOQL parser, 2000 rows a batch with nextRecordsUrl; sobjects POST (201 { id, success,
// errors }), GET with fields, PATCH 204, upsert by external id (201 made, 200 changed), DELETE 204;
// /composite with allOrNone, @{ref.id} and PROCESSING_HALTED; /composite/sobjects at most 200.
// Errors are lists: [{ message, errorCode, fields }]; a dead session is a 401 INVALID_SESSION_ID.
// Every answer has Sforce-Limit-Info. The instance is a different address from the login.
//
//   start({ port, ports }) -> { env: { SALESFORCE_* }, close(), check() }
import { createServer } from "node:http";
import { generateKeyPairSync, createVerify, randomBytes } from "node:crypto";

const ID = "3MVG9standinClientId", SECRET = "standin-secret", USER = "ada@quillo.example";

export async function start({ port, ports }) {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const login = `http://127.0.0.1:${ports[0]}`, instance = `http://127.0.0.1:${ports[1]}`;
    const stats = { jwt: 0, client: 0, next: 0, composite: 0, renewed: 0, biggest: 0, refused: [] };
    const tokens = new Set();
    const tables = { Account: new Map(), Contact: new Map(), Lead: new Map() };
    let n = 1000, calls = 0, killed = false;
    const makeId = (prefix) => `${prefix}${String(++n).padStart(12, "0")}AAA`;
    for (let i = 0; i < 4500; i++) { const Id = makeId("00Q"); tables.Lead.set(Id, { Id, Name: `Lead ${i}` }); }
    const cursors = new Map();
    const loginServer = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            const fail = (error, error_description) => { stats.refused.push(error_description); send(400, { error, error_description }); };
            const f = new URLSearchParams(body);
            const grant = () => { const t = "00D!" + randomBytes(16).toString("hex"); tokens.add(t); send(200, { access_token: t, instance_url: instance, id: `${login}/id/00D/005`, token_type: "Bearer", issued_at: String(Date.now()) }); };
            if (new URL(req.url, "http://x").pathname !== "/services/oauth2/token") return send(404, {});
            if (f.get("grant_type") === "client_credentials") {
                if (f.get("client_id") !== ID || f.get("client_secret") !== SECRET) return fail("invalid_client", "invalid client credentials");
                stats.client++;
                return grant();
            }
            if (f.get("grant_type") === "urn:ietf:params:oauth:grant-type:jwt-bearer") {
                const [h, p, s] = (f.get("assertion") ?? "").split(".");
                const c = JSON.parse(Buffer.from(p ?? "", "base64url").toString() || "{}");
                const v = createVerify("RSA-SHA256"); v.update(`${h}.${p}`);
                if (!s || !v.verify(publicKey, Buffer.from(s, "base64url"))) return fail("invalid_grant", "invalid assertion");
                if (c.iss !== ID) return fail("invalid_client_id", "client identifier invalid");
                if (c.aud !== login) return fail("invalid_grant", "audience is invalid");
                if (c.sub !== USER) return fail("invalid_grant", "user hasn't approved this consumer");
                if (c.exp < Date.now() / 1000 || c.exp > Date.now() / 1000 + 180) return fail("invalid_grant", "expired or too distant exp");
                stats.jwt++;
                return grant();
            }
            return fail("unsupported_grant_type", "grant type not supported");
        });
    });
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const headers = { "content-type": "application/json;charset=UTF-8", "sforce-limit-info": `api-usage=${++calls}/15000` };
            const send = (code, v) => { res.writeHead(code, headers); res.end(v === undefined ? "" : JSON.stringify(v)); };
            const errs = (code, errorCode, message, fields = []) => send(code, [{ message, errorCode, fields }]);
            const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
            if (!tokens.has(token)) { return errs(401, "INVALID_SESSION_ID", "Session expired or invalid"); }
            const url = new URL(req.url, "http://x");
            const m0 = /^\/services\/data\/v\d+\.\d\/(.*)$/.exec(url.pathname);
            if (!m0) return errs(404, "NOT_FOUND", "The requested resource does not exist");
            const p = m0[1];
            const b = body ? JSON.parse(body) : {};
            const attrs = (t, id) => ({ type: t, url: `/services/data/v62.0/sobjects/${t}/${id}` });
            const create = (t, x, resolve = (v) => v) => {
                if (t === "Account" && !x.Name) return { error: { status: 400, list: [{ message: "Required fields are missing: [Name]", errorCode: "REQUIRED_FIELD_MISSING", fields: ["Name"] }] } };
                const { attributes, ...fields } = x;
                const Id = makeId(t === "Account" ? "001" : "003");
                tables[t].set(Id, { Id, ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, resolve(v)])) });
                return { id: Id };
            };
            let m;
            if (p === "query" || p === "queryAll") {
                const soql = url.searchParams.get("q") ?? "";
                const s = /^SELECT (.+?) FROM (\w+)(?: WHERE (\w+) = '((?:[^'\\]|\\.)*)')?$/i.exec(soql);
                if (s && s[2] === "Busy") { if (!stats.busy) { stats.busy = 1; return errs(503, "SERVER_UNAVAILABLE", "Server is busy"); } return send(200, { totalSize: 0, done: true, records: [] }); }
                if (!s || !tables[s[2]]) return errs(400, "MALFORMED_QUERY", `sObject type '${s?.[2] ?? "?"}' is not supported.`);
                const value = s[4]?.replace(/\\(.)/g, "$1");
                const fields = s[1].split(",").map((x) => x.trim());
                const rows = [...tables[s[2]].values()].filter((r) => !s[3] || r[s[3]] === value).map((r) => ({ attributes: attrs(s[2], r.Id), ...Object.fromEntries(fields.map((f) => [f, r[f] ?? null])) }));
                if (p === "queryAll") rows.push({ attributes: attrs(s[2], "deleted"), Id: "deleted", Name: "Gone" });
                const first = rows.slice(0, 2000), rest = rows.slice(2000);
                const out = { totalSize: rows.length, done: rest.length === 0, records: first };
                if (rest.length) { const key = `01g${++n}-2000`; cursors.set(key, rest); out.nextRecordsUrl = `/services/data/v62.0/query/${key}`; }
                return send(200, out);
            }
            if (m = /^query\/(.+)$/.exec(p)) {
                const rows = cursors.get(m[1]);
                if (!rows) return errs(400, "INVALID_QUERY_LOCATOR", "invalid query locator");
                stats.next++;
                const first = rows.slice(0, 2000), rest = rows.slice(2000);
                const out = { totalSize: 0, done: rest.length === 0, records: first };
                if (rest.length) { const key = `01g${++n}-more`; cursors.set(key, rest); out.nextRecordsUrl = `/services/data/v62.0/query/${key}`; }
                return send(200, out);
            }
            if (p === "composite") {
                stats.composite++;
                if ((b.compositeRequest ?? []).length > 25) return errs(400, "INVALID_FIELD", "Too many subrequests");
                const refs = {}, results = [], made = [];
                const resolve = (v) => (typeof v === "string" ? v.replace(/@\{(\w+)\.id\}/g, (_, r) => refs[r]?.id ?? "") : v);
                let failed = false;
                for (const s of b.compositeRequest) {
                    const t = /sobjects\/(\w+)/.exec(s.url)?.[1];
                    const r = failed ? { error: { status: 400, list: [{ message: "The transaction was rolled back since another operation in the same transaction failed.", errorCode: "PROCESSING_HALTED" }] } } : create(t, s.body ?? {}, resolve);
                    if (r.error) {
                        failed = failed || b.allOrNone;
                        results.push({ body: r.error.list, httpHeaders: {}, httpStatusCode: r.error.status, referenceId: s.referenceId });
                    } else {
                        refs[s.referenceId] = r; made.push([t, r.id]);
                        results.push({ body: { id: r.id, success: true, errors: [] }, httpHeaders: {}, httpStatusCode: 201, referenceId: s.referenceId });
                    }
                }
                if (failed) {
                    for (const [t, id] of made) tables[t].delete(id);
                    results.forEach((r) => { if (r.httpStatusCode === 201) { r.httpStatusCode = 400; r.body = [{ message: "The transaction was rolled back since another operation in the same transaction failed.", errorCode: "PROCESSING_HALTED" }]; } });
                }
                return send(200, { compositeResponse: results });
            }
            if (p === "composite/sobjects") {
                stats.biggest = Math.max(stats.biggest, b.records.length);
                if (b.records.length > 200) return errs(400, "EXCEEDED_ID_LIMIT", "record limit reached. cannot submit more than 200 records in this operation");
                return send(200, b.records.map((x) => { const r = create(x.attributes.type, x); return r.error ? { success: false, errors: r.error.list.map((e) => ({ statusCode: e.errorCode, message: e.message, fields: e.fields })) } : { id: r.id, success: true, errors: [] }; }));
            }
            if (m = /^sobjects\/(\w+)$/.exec(p)) {
                if (!tables[m[1]]) return errs(404, "NOT_FOUND", `The requested resource does not exist`);
                // An expired session, once, as if the org had ended it.
                if (b.Name === "After an expired session" && !killed) { killed = true; tokens.clear(); stats.renewed++; return errs(401, "INVALID_SESSION_ID", "Session expired or invalid"); }
                const r = create(m[1], b);
                return r.error ? send(r.error.status, r.error.list) : send(201, { id: r.id, success: true, errors: [] });
            }
            if (m = /^sobjects\/(\w+)\/(\w+__c)\/(.+)$/.exec(p)) {
                const found = [...tables[m[1]].values()].find((r) => r[m[2]] === decodeURIComponent(m[3]));
                if (found) { Object.assign(found, b); return send(200, { id: found.Id, success: true, created: false, errors: [] }); }
                const r = create(m[1], { ...b, [m[2]]: decodeURIComponent(m[3]) });
                return send(201, { id: r.id, success: true, created: true, errors: [] });
            }
            if (m = /^sobjects\/(\w+)\/(\w+)$/.exec(p)) {
                const rec = tables[m[1]]?.get(m[2]);
                if (!rec) return errs(404, "NOT_FOUND", "Provided external ID field does not exist or is not accessible");
                if (req.method === "PATCH") { Object.assign(rec, b); return send(204); }
                if (req.method === "DELETE") { tables[m[1]].delete(m[2]); return send(204); }
                const fields = url.searchParams.get("fields")?.split(",") ?? Object.keys(rec);
                return send(200, { attributes: attrs(m[1], rec.Id), ...Object.fromEntries(fields.map((f) => [f, rec[f] ?? null])) });
            }
            return errs(404, "NOT_FOUND", "The requested resource does not exist");
        });
    });
    await new Promise((ok) => loginServer.listen(ports[0], "127.0.0.1", ok));
    await new Promise((ok) => server.listen(ports[1], "127.0.0.1", ok));
    return {
        env: { SALESFORCE_LOGIN_URL: login, SALESFORCE_CLIENT_ID: ID, SALESFORCE_CLIENT_SECRET: SECRET, SALESFORCE_USERNAME: USER, SALESFORCE_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }), SALESFORCE_API_VERSION: "v62.0" },
        close() { server.close(); loginServer.close(); server.closeAllConnections?.(); loginServer.closeAllConnections?.(); },
        check() {
            if (!stats.jwt || !stats.client) return `the Salesforce stand-in did not see both sign-ins: ${JSON.stringify(stats)}`;
            if (!stats.next) return "nextRecordsUrl was never followed";
            if (!stats.composite) return "the Salesforce stand-in got no composite call";
            if (!stats.renewed) return "the Salesforce stand-in never ended a session";
            if (stats.biggest > 200) return "a collection held more than 200 records";
            return null;
        },
    };
}
