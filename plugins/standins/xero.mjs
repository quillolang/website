// Xero's identity and Accounting API for the xero plugin's test, written from developer.xero.com's
// OAuth2 guide, Accounting API reference and "Rate limits": POST /connect/token with HTTP Basic and
// grant_type=refresh_token, where a refresh token works once and a new one comes back (reuse is
// invalid_grant); the first access token is refused after one use, as if expired. GET /connections,
// and under /api.xro/2.0 the xero-tenant-id header (a 403 without it), Invoices, Contacts and
// Payments with `page` (100 a page), If-Modified-Since, `where`, summarizeErrors=false answering a
// 200 with HasErrors and ValidationErrors on each record, a whole-call ValidationException otherwise,
// Idempotency-Key, X-MinLimit-Remaining and X-DayLimit-Remaining, and 429 with Retry-After and
// X-Rate-Limit-Problem. Dates come back as /Date(...)/.
//
//   start({ port }) -> { env: { XERO_API_URL, XERO_TOKEN_URL, XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REFRESH_TOKEN, XERO_TOKEN_FILE }, close(), check() }
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ID = "standin-client", SECRET = "standin-secret", TENANT = "70784a63-d24b-46a9-a4db-0e70a274b056";

export async function start({ port }) {
    const dir = mkdtempSync(join(tmpdir(), "xero-standin-"));
    const file = join(dir, "token");
    const stats = { refreshes: 0, reused: 0, renewedAfter401: 0, pages: 0, limited: 0, idempotent: 0, missingTenant: 0 };
    let current = "refresh-0", accessGood = null, accessUses = 0, n = 0;
    const invoices = new Map(), contacts = new Map(), payments = [], keys = new Map();
    for (let i = 0; i < 205; i++) { const k = randomUUID(); invoices.set(k, { InvoiceID: k, Type: i % 5 ? "ACCREC" : "ACCPAY", Status: "PAID", Total: 10, AmountDue: 0, Date: "/Date(1518685950940+0000)/", old: i % 2 === 0 }); }
    for (let i = 0; i < 105; i++) { const k = randomUUID(); contacts.set(k, { ContactID: k, Name: `Contact ${i}` }); }
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v, headers = {}) => { res.writeHead(code, { "content-type": "application/json", "x-minlimit-remaining": "59", "x-daylimit-remaining": "4999", "x-appminlimit-remaining": "9999", ...headers }); res.end(v === undefined ? "" : JSON.stringify(v)); };
            const url = new URL(req.url, "http://x");
            const p = url.pathname, q = url.searchParams;
            if (p === "/connect/token") {
                if (req.headers.authorization !== `Basic ${Buffer.from(`${ID}:${SECRET}`).toString("base64")}`) return send(401, { error: "invalid_client" });
                const f = new URLSearchParams(body);
                if (f.get("grant_type") !== "refresh_token") return send(400, { error: "unsupported_grant_type" });
                if (f.get("refresh_token") !== current) { stats.reused++; return send(400, { error: "invalid_grant" }); }
                current = `refresh-${++n}`; accessGood = randomUUID(); accessUses = 0; stats.refreshes++;
                return send(200, { access_token: accessGood, expires_in: 1800, token_type: "Bearer", refresh_token: current, scope: "accounting.transactions accounting.contacts offline_access" });
            }
            if (req.headers.authorization !== `Bearer ${accessGood}` || (n === 1 && accessUses++ >= 1)) { if (n === 1) stats.renewedAfter401++; return send(401, { Type: "Unauthorized", Title: "Unauthorized", Status: 401, Detail: "TokenExpired: token expired" }); }
            if (p === "/connections") return send(200, [{ id: "c1", tenantId: TENANT, tenantType: "ORGANISATION", tenantName: "Quillo Demo Ltd" }]);
            if (!p.startsWith("/api.xro/2.0")) return send(404, { Message: "Not found" });
            if (req.headers["xero-tenant-id"] !== TENANT) { stats.missingTenant++; return send(403, { Type: "Forbidden", Title: "Forbidden", Status: 403, Detail: "AuthenticationUnsuccessful" }); }
            const rest = p.slice("/api.xro/2.0".length);
            const b = body ? JSON.parse(body) : {};
            const invalid = (messages) => send(400, { ErrorNumber: 10, Type: "ValidationException", Message: "A validation exception occurred", Elements: [{ ValidationErrors: messages.map((Message) => ({ Message })) }] });
            const list = (field, all) => {
                const page = Number(q.get("page") ?? 1);
                if (page > 1) stats.pages++;
                send(200, { Id: randomUUID(), Status: "OK", ProviderName: "Quillo", [field]: all.slice((page - 1) * 100, page * 100) });
            };
            let m;
            if (rest === "/Busy") { if (!stats.limited) { stats.limited++; return send(429, undefined, { "retry-after": "1", "x-rate-limit-problem": "minute" }); } return send(200, { Status: "OK" }); }
            if (rest === "/Daily") return send(429, undefined, { "retry-after": "3600", "x-rate-limit-problem": "day" });
            const invoiceCheck = (x) => {
                const errors = [];
                if (!x.Contact) errors.push("A Contact must be specified with this type of transaction");
                if (!x.LineItems?.length) errors.push("One or more line items must be specified");
                return errors;
            };
            const makeInvoice = (x) => {
                const total = x.LineItems.reduce((a, l) => a + l.Quantity * l.UnitAmount, 0);
                const inv = { ...x, InvoiceID: randomUUID(), Total: total, AmountDue: total, Status: x.Status ?? "DRAFT" };
                invoices.set(inv.InvoiceID, inv);
                return inv;
            };
            if (rest === "/Invoices" && req.method === "PUT") {
                const idem = req.headers["idempotency-key"];
                if (idem && keys.has(idem)) { stats.idempotent++; return send(200, keys.get(idem)); }
                const lone = q.get("summarizeErrors") !== "false";
                const out = b.Invoices.map((x) => { const e = invoiceCheck(x); return e.length ? { ...x, HasErrors: true, ValidationErrors: e.map((Message) => ({ Message })) } : makeInvoice(x); });
                if (lone && out.some((x) => x.HasErrors)) return invalid(out.flatMap((x) => x.ValidationErrors ?? []).map((e) => e.Message));
                const answer = { Status: "OK", Invoices: out };
                if (idem) keys.set(idem, answer);
                return send(200, answer);
            }
            if (rest === "/Invoices" && req.method === "GET") {
                let all = [...invoices.values()].filter((x) => !q.get("Statuses") || q.get("Statuses").split(",").includes(x.Status));
                if (req.headers["if-modified-since"]) all = all.filter((x) => !x.old);
                if (q.get("where") && (m = /^Type=="(\w+)"$/.exec(q.get("where")))) all = all.filter((x) => x.Type === m[1]);
                return list("Invoices", all);
            }
            if (m = /^\/Invoices\/([^/]+)$/.exec(rest)) {
                const inv = invoices.get(m[1]);
                if (!inv) return send(404, { Title: "Not Found", Status: 404, Detail: "The resource you're looking for cannot be found" });
                if (req.method === "POST") Object.assign(inv, b.Invoices[0]);
                return send(200, { Status: "OK", Invoices: [inv] });
            }
            if (rest === "/Contacts" && req.method === "PUT") {
                const out = b.Contacts.map((x) => {
                    const taken = [...contacts.values()].some((c) => c.Name === x.Name);
                    if (taken) return { ...x, HasErrors: true, ValidationErrors: [{ Message: "The contact name Ada Lovelace Ltd is already assigned to another contact. The contact name must be unique across all contacts." }] };
                    const c = { ...x, ContactID: randomUUID() }; contacts.set(c.ContactID, c); return c;
                });
                return send(200, { Status: "OK", Contacts: out });
            }
            if (rest === "/Contacts") return list("Contacts", [...contacts.values()]);
            if (m = /^\/Contacts\/([^/]+)$/.exec(rest)) return contacts.has(m[1]) ? send(200, { Status: "OK", Contacts: [contacts.get(m[1])] }) : send(404, { Title: "Not Found", Status: 404, Detail: "Not found" });
            if (rest === "/Payments" && req.method === "PUT") {
                const out = b.Payments.map((x) => {
                    const inv = invoices.get(x.Invoice?.InvoiceID);
                    if (!inv || inv.Status !== "AUTHORISED") return { ...x, HasErrors: true, ValidationErrors: [{ Message: "Payment cannot be created for an invoice that is not authorised" }] };
                    inv.AmountDue -= x.Amount; if (inv.AmountDue <= 0) inv.Status = "PAID";
                    const r = { PaymentID: randomUUID(), Status: "AUTHORISED", ...x }; payments.push(r); return r;
                });
                return send(200, { Status: "OK", Payments: out });
            }
            if (rest === "/Payments") return list("Payments", payments);
            return send(404, { Title: "Not Found", Status: 404, Detail: "The resource you're looking for cannot be found" });
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    const base = `http://127.0.0.1:${port}`;
    return {
        env: { XERO_API_URL: base, XERO_TOKEN_URL: `${base}/connect/token`, XERO_CLIENT_ID: ID, XERO_CLIENT_SECRET: SECRET, XERO_REFRESH_TOKEN: "refresh-0", XERO_TOKEN_FILE: file },
        close() { server.close(); server.closeAllConnections?.(); rmSync(dir, { recursive: true, force: true }); },
        check() {
            if (stats.refreshes < 2) return "the Xero stand-in saw no refresh after a token ran out";
            if (stats.reused) return "a refresh token was used twice";
            if (!stats.pages) return "the Xero stand-in was never asked for a second page";
            if (!stats.limited) return "the Xero stand-in never saw a 429 waited out";
            if (!stats.idempotent) return "the Xero stand-in never saw an Idempotency-Key repeated";
            let kept = "";
            try { kept = readFileSync(file, "utf8"); } catch {}
            if (kept !== current) return `XERO_TOKEN_FILE holds ${kept}, not the newest refresh token ${current}`;
            return null;
        },
    };
}
