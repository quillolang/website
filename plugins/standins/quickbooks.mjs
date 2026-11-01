// QuickBooks Online and Intuit's token endpoint for the quickbooks plugin's test, written from
// developer.intuit.com's Accounting API reference, "Data queries", "Error codes" and "Change data /
// webhooks": POST /oauth2/v1/tokens/bearer with HTTP Basic, the refresh token moving on every time;
// /v3/company/:realm with minorversion; a small parser of the query language (select * or count(*),
// where on one field with \' escapes, STARTPOSITION, MAXRESULTS at most 1000); POST to create or to
// update, where a SyncToken not the current one is Fault code 5010 "Stale Object Error", sparse keeps
// the other fields; ?operation=delete and void; a taken DisplayName is 6240. Faults are
// { Fault: { Error: [{ Message, Detail, code, element }], type }, time }, with an intuit_tid header,
// and a 401 is in lower case ({ fault: { error: [...] } }), as Intuit's is. The first access token
// is good for only one call. Item "busy" is throttled once, and "fault" answers a Fault in a 200.
//
//   start({ port }) -> { env: { QUICKBOOKS_* }, close(), check() }
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const ID = "standin-client", SECRET = "standin-secret", REALM = "1185883450";

export async function start({ port }) {
    const stats = { refreshes: 0, reused: 0, pages: 0, tooMany: 0, throttled: 0, stale: 0 };
    let current = "AB-refresh-0", access = null, uses = 0, n = 100, gen = 0;
    const tables = { Customer: new Map(), Invoice: new Map(), Item: new Map() };
    for (let i = 1; i <= 2350; i++) tables.Item.set(String(i), { Id: String(i), SyncToken: "0", Name: `Item ${i}`, Active: i % 2 === 0 });
    tables.Item.set("busy", { Id: "busy", SyncToken: "0", Name: "Busy thing", Active: true });
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const tid = "1-" + randomUUID().slice(0, 8);
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json", intuit_tid: tid }); res.end(JSON.stringify(v)); };
            const fault = (status, code, Message, Detail, type = "ValidationFault", element) => send(status, { Fault: { Error: [{ Message, Detail, code, ...(element ? { element } : {}) }], type }, time: new Date().toISOString() });
            const url = new URL(req.url, "http://x");
            const p = url.pathname, q = url.searchParams;
            if (p === "/oauth2/v1/tokens/bearer") {
                if (req.headers.authorization !== `Basic ${Buffer.from(`${ID}:${SECRET}`).toString("base64")}`) return send(401, { error: "invalid_client" });
                const f = new URLSearchParams(body);
                if (f.get("refresh_token") !== current) { stats.reused++; return send(400, { error: "invalid_grant", error_description: "Incorrect Token type or clientID" }); }
                current = `AB-refresh-${++gen}`; access = randomUUID(); uses = 0; stats.refreshes++;
                return send(200, { token_type: "bearer", access_token: access, expires_in: 3600, refresh_token: current, x_refresh_token_expires_in: 8640000 });
            }
            if (req.headers.authorization !== `Bearer ${access}` || (gen === 1 && uses++ >= 1)) return send(401, { warnings: null, intuitObject: null, fault: { error: [{ message: "message=AuthenticationFailed; errorCode=003200; statusCode=401", detail: "Token expired", code: "3200" }], type: "AUTHENTICATION" }, time: Date.now() });
            const m = /^\/v3\/company\/(\d+)\/(.+)$/.exec(p);
            if (!m || m[1] !== REALM) return fault(403, "3100", "ApplicationAuthorizationFailed", "Wrong realm", "AUTHORIZATION");
            if (!q.get("minorversion")) return fault(400, "2030", "Invalid minorversion", "minorversion is required");
            const path = m[2];
            const b = body ? JSON.parse(body) : {};
            if (path === "query") {
                const text = q.get("query") ?? "";
                const s = /^select (\*|count\(\*\)) from (\w+)(?: where (\w+) = (true|false|'((?:[^'\\]|\\.)*)'))?(?: STARTPOSITION (\d+))?(?: MAXRESULTS (\d+))?$/i.exec(text);
                if (!s || !tables[s[2]]) return fault(400, "4000", "Error parsing query", `QueryParserError: Encountered an unexpected token in "${text}"`);
                const value = s[4] === "true" ? true : s[4] === "false" ? false : s[5]?.replace(/\\(.)/g, "$1");
                const all = [...tables[s[2]].values()].filter((r) => !s[3] || r[s[3]] === value);
                if (s[1] !== "*") return send(200, { QueryResponse: { totalCount: all.length }, time: new Date().toISOString() });
                const start = Number(s[6] ?? 1), max = Number(s[7] ?? 100);
                if (max > 1000) { stats.tooMany++; return fault(400, "4001", "Invalid query", "MAXRESULTS is at most 1000"); }
                if (start > 1) stats.pages++;
                const rows = all.slice(start - 1, start - 1 + max);
                return send(200, { QueryResponse: rows.length ? { [s[2]]: rows, startPosition: start, maxResults: rows.length } : {}, time: new Date().toISOString() });
            }
            const r = /^(customer|invoice|item)(?:\/(.+))?$/.exec(path);
            if (!r) return fault(404, "610", "Object Not Found", "Unknown resource");
            const name = r[1][0].toUpperCase() + r[1].slice(1), table = tables[name];
            const wrap = (rec) => send(200, { [name]: rec, time: new Date().toISOString() });
            if (req.method === "GET") {
                if (r[2] === "busy" && !stats.throttled) { stats.throttled++; return fault(429, "3001", "message=ThrottleExceeded; errorCode=003001; statusCode=429", "Throttling limits exceeded", "SERVICE"); }
                if (r[2] === "fault") return fault(200, "6000", "A business validation error has occurred", "Business Validation Error");
                const rec = table.get(r[2]);
                return rec ? wrap(rec) : fault(400, "610", "Object Not Found", "Something you're trying to use has been made inactive. Check the fields with accounts, customers, items, vendors or employees.");
            }
            const op = q.get("operation");
            if (b.Id) {
                const rec = table.get(b.Id);
                if (!rec) return fault(400, "610", "Object Not Found", "Object not found");
                if (b.SyncToken !== rec.SyncToken) { stats.stale++; return fault(400, "5010", "Stale Object Error", `Stale Object Error : You and ${"another user"} were working on this at the same time.`); }
                if (op === "delete") { table.delete(b.Id); return wrap({ status: "Deleted", domain: "QBO", Id: b.Id }); }
                if (op === "void") { Object.assign(rec, { TotalAmt: 0, Balance: 0, PrivateNote: "Voided" }); }
                else { const { sparse, ...fields } = b; if (!sparse) return fault(400, "2010", "Request has invalid or unsupported property", "Full updates are not kept by this stand-in"); Object.assign(rec, fields); }
                rec.SyncToken = String(Number(rec.SyncToken) + 1);
                return wrap(rec);
            }
            if (name === "Customer") {
                if (!b.DisplayName) return fault(400, "2020", "Required param missing, need to supply the required value for the API", "DisplayName is required", "ValidationFault", "DisplayName");
                if ([...table.values()].some((c) => c.DisplayName === b.DisplayName)) return fault(400, "6240", "Duplicate Name Exists Error", `The name supplied already exists. : Another customer is already using this name.`);
            }
            if (name === "Invoice") {
                if (!b.CustomerRef?.value || !b.Line?.length) return fault(400, "2020", "Required param missing, need to supply the required value for the API", "CustomerRef and Line are required");
                b.TotalAmt = b.Line.reduce((a, l) => a + l.Amount, 0); b.Balance = b.TotalAmt;
            }
            const rec = { ...b, Id: String(++n), SyncToken: "0" };
            table.set(rec.Id, rec);
            return wrap(rec);
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    const base = `http://127.0.0.1:${port}`;
    return {
        env: { QUICKBOOKS_API_URL: base, QUICKBOOKS_TOKEN_URL: `${base}/oauth2/v1/tokens/bearer`, QUICKBOOKS_CLIENT_ID: ID, QUICKBOOKS_CLIENT_SECRET: SECRET, QUICKBOOKS_REFRESH_TOKEN: "AB-refresh-0", QUICKBOOKS_REALM_ID: REALM },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (stats.refreshes < 2) return "the QuickBooks stand-in saw no refresh after a token ran out";
            if (stats.reused) return "a refresh token was used after it moved on";
            if (!stats.pages) return "the QuickBooks stand-in was never asked for a second page";
            if (stats.tooMany) return "a query asked for more than MAXRESULTS 1000";
            if (!stats.throttled) return "the QuickBooks stand-in never throttled a request";
            if (!stats.stale) return "the QuickBooks stand-in never saw a stale SyncToken";
            return null;
        },
    };
}
