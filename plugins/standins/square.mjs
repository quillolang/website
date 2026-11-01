// A Square API for the square plugin's test, written from Square's API reference (Payments, Refunds,
// Customers, Catalog) and "Handling errors": Bearer token and Square-Version required, every error
// is { errors: [{ category, code, detail, field }] }, writes need idempotency_key (at most 45
// characters; the same key and body answers with the first result, a changed body is
// IDEMPOTENCY_KEY_REUSED), lists page through `cursor`, `autocomplete: false` holds a payment until
// /complete or /cancel, a refund past the amount left is refused, an update with an old `version`
// is a conflict. A catalog upsert maps the temporary #ids to real ones. The source id
// `cnon:card-nonce-declined` declines, as the sandbox does, and `cnon:rate-limit-once` answers
// RATE_LIMITED once, to see the retry bring the same key.
//
//   start({ port }) -> { env: { SQUARE_API_URL, SQUARE_ACCESS_TOKEN }, close(), check() }
import { createServer } from "node:http";

const TOKEN = "qk-test-square";

export async function start({ port }) {
    const stats = { payments: 0, cursors: 0, rateLimited: 0, retriedWithSameKey: 0, refunds: 0, noVersion: 0 };
    const payments = new Map(), refunds = new Map(), customers = new Map(), catalog = new Map(), keys = new Map();
    let n = 1000, limitedKey = null;
    const id = (p) => `${p}${++n}`;
    // Past payments, customers and items, enough for several pages.
    const past = [];
    for (let i = 0; i < 235; i++) past.push({ id: id("past"), status: "COMPLETED", location_id: "L1", amount_money: { amount: 100 + i, currency: "USD" } });
    const pastCustomers = [];
    for (let i = 0; i < 120; i++) pastCustomers.push({ id: id("cust"), given_name: `C${i}`, version: 1 });
    for (let i = 0; i < 205; i++) { const o = { type: i % 41 ? "ITEM" : "CATEGORY", id: id("OLD"), version: 1 }; catalog.set(o.id, o); }
    const page = (all, cursor, size) => {
        const at = cursor ? Number(Buffer.from(cursor, "base64").toString()) : 0;
        const next = at + size < all.length ? Buffer.from(String(at + size)).toString("base64") : undefined;
        return [all.slice(at, at + size), next];
    };
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            const err = (code, category, c, detail, field) => send(code, { errors: [{ category, code: c, detail, ...(field ? { field } : {}) }] });
            if (req.headers.authorization !== `Bearer ${TOKEN}`) return err(401, "AUTHENTICATION_ERROR", "UNAUTHORIZED", "This request could not be authorized.");
            if (!req.headers["square-version"]) stats.noVersion++;
            const url = new URL(req.url, "http://x");
            const p = url.pathname, q = url.searchParams;
            const b = body ? JSON.parse(body) : {};
            let m;
            // Writes that take a key: a repeat answers as the first did.
            if (["/v2/payments", "/v2/refunds", "/v2/customers", "/v2/catalog/object"].includes(p) && req.method === "POST") {
                if (typeof b.idempotency_key !== "string" || !b.idempotency_key) return err(400, "INVALID_REQUEST_ERROR", "MISSING_REQUIRED_PARAMETER", "Field must be set", "idempotency_key");
                if (b.idempotency_key.length > 45) return err(400, "INVALID_REQUEST_ERROR", "VALUE_TOO_LONG", "Field must not be greater than 45 length", "idempotency_key");
                const seen = keys.get(b.idempotency_key);
                if (seen) return seen.body === body ? send(200, seen.answer) : err(400, "INVALID_REQUEST_ERROR", "IDEMPOTENCY_KEY_REUSED", "The idempotency key can only be retried with the same request data.", "idempotency_key");
            }
            const keep = (answer) => { keys.set(b.idempotency_key, { body, answer }); send(200, answer); };
            if (req.method === "POST" && p === "/v2/payments") {
                if (b.source_id === "cnon:rate-limit-once" && limitedKey == null) { limitedKey = b.idempotency_key; stats.rateLimited++; return err(429, "RATE_LIMIT_ERROR", "RATE_LIMITED", "Too many requests"); }
                if (limitedKey && limitedKey === b.idempotency_key) stats.retriedWithSameKey++;
                if (!b.source_id) return err(400, "INVALID_REQUEST_ERROR", "MISSING_REQUIRED_PARAMETER", "Field must be set", "source_id");
                if (!Number.isInteger(b.amount_money?.amount) || !b.amount_money?.currency) return err(400, "INVALID_REQUEST_ERROR", "INVALID_VALUE", "Invalid amount_money", "amount_money");
                if (b.source_id === "cnon:card-nonce-declined") return err(402, "PAYMENT_METHOD_ERROR", "GENERIC_DECLINE", "Authorization error: 'GENERIC_DECLINE'");
                const pay = { id: id("pay"), status: b.autocomplete === false ? "APPROVED" : "COMPLETED", amount_money: b.amount_money, refunded: 0, reference_id: b.reference_id, note: b.note };
                payments.set(pay.id, pay); stats.payments++;
                return keep({ payment: pay });
            }
            if (req.method === "GET" && p === "/v2/payments") {
                if (q.get("cursor")) stats.cursors++;
                const [slice, cursor] = page(past.filter((x) => !q.get("location_id") || x.location_id === q.get("location_id")), q.get("cursor"), 100);
                return send(200, { payments: slice, ...(cursor ? { cursor } : {}) });
            }
            if (m = /^\/v2\/payments\/([^/]+)(\/(complete|cancel))?$/.exec(p)) {
                const pay = payments.get(m[1]);
                if (!pay) return err(404, "INVALID_REQUEST_ERROR", "NOT_FOUND", `Could not find payment with id: ${m[1]}`);
                if (m[3]) {
                    if (pay.status !== "APPROVED") return err(400, "INVALID_REQUEST_ERROR", "BAD_REQUEST", `Payment ${pay.id} is ${pay.status} and cannot be changed.`);
                    pay.status = m[3] === "complete" ? "COMPLETED" : "CANCELED";
                }
                return send(200, { payment: pay });
            }
            if (req.method === "POST" && p === "/v2/refunds") {
                const pay = payments.get(b.payment_id);
                if (!pay) return err(404, "INVALID_REQUEST_ERROR", "NOT_FOUND", `Could not find payment with id: ${b.payment_id}`);
                if (pay.refunded + b.amount_money.amount > pay.amount_money.amount) return err(400, "INVALID_REQUEST_ERROR", "REFUND_AMOUNT_INVALID", "The requested refund amount exceeds the amount available to refund.", "amount_money.amount");
                pay.refunded += b.amount_money.amount;
                const r = { id: id("ref"), status: "PENDING", payment_id: pay.id, amount_money: b.amount_money, reason: b.reason, reads: 0 };
                refunds.set(r.id, r); stats.refunds++;
                return keep({ refund: { ...r } });
            }
            if (m = /^\/v2\/refunds\/([^/]+)$/.exec(p)) {
                const r = refunds.get(m[1]);
                if (!r) return err(404, "INVALID_REQUEST_ERROR", "NOT_FOUND", "Refund not found");
                r.status = "COMPLETED";
                return send(200, { refund: r });
            }
            if (req.method === "POST" && p === "/v2/customers") {
                if (!b.given_name && !b.family_name && !b.company_name && !b.nickname && !b.email_address && !b.phone_number) return err(400, "INVALID_REQUEST_ERROR", "BAD_REQUEST", "At least one of the following is required: given_name, family_name, company_name, nickname, email_address, phone_number.");
                if (b.email_address && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email_address)) return err(400, "INVALID_REQUEST_ERROR", "INVALID_EMAIL_ADDRESS", "Expected email_address to be a valid email address", "email_address");
                const { idempotency_key, ...fields } = b;
                const c = { id: id("cust"), version: 1, ...fields };
                customers.set(c.id, c);
                return keep({ customer: c });
            }
            if (req.method === "GET" && p === "/v2/customers") {
                if (q.get("cursor")) stats.cursors++;
                const [slice, cursor] = page([...pastCustomers, ...customers.values()], q.get("cursor"), Number(q.get("limit") ?? 100));
                return send(200, { customers: slice, ...(cursor ? { cursor } : {}) });
            }
            if (req.method === "POST" && p === "/v2/customers/search") {
                const exact = b.query?.filter?.email_address?.exact;
                return send(200, { customers: [...customers.values()].filter((c) => c.email_address === exact) });
            }
            if (m = /^\/v2\/customers\/([^/]+)$/.exec(p)) {
                const c = customers.get(m[1]);
                if (!c) return err(404, "INVALID_REQUEST_ERROR", "NOT_FOUND", "Customer not found");
                if (req.method === "PUT") {
                    if (b.version != null && b.version !== c.version) return err(400, "INVALID_REQUEST_ERROR", "CONFLICT", "Attempted to update an object with an old version", "version");
                    Object.assign(c, b, { version: c.version + 1 });
                }
                return send(200, { customer: c });
            }
            if (req.method === "POST" && p === "/v2/catalog/object") {
                const o = b.object, map = [];
                if (!String(o?.id).startsWith("#")) return err(400, "INVALID_REQUEST_ERROR", "INVALID_VALUE", "A new object's id must start with #", "object.id");
                const real = (t) => { const r = id("CAT"); map.push({ client_object_id: t, object_id: r }); return r; };
                const itemId = real(o.id);
                const vars = (o.item_data?.variations ?? []).map((x) => ({ ...x, id: real(x.id), item_variation_data: { ...x.item_variation_data, item_id: itemId } }));
                const made = { ...o, id: itemId, version: 1, item_data: { ...o.item_data, variations: vars } };
                catalog.set(itemId, made);
                return keep({ catalog_object: made, id_mappings: map });
            }
            if (req.method === "GET" && p === "/v2/catalog/list") {
                if (q.get("cursor")) stats.cursors++;
                const types = q.get("types")?.split(",");
                const [slice, cursor] = page([...catalog.values()].filter((o) => !types || types.includes(o.type)), q.get("cursor"), 100);
                return send(200, { objects: slice, ...(cursor ? { cursor } : {}) });
            }
            if ((m = /^\/v2\/catalog\/object\/([^/]+)$/.exec(p)) && req.method === "DELETE") {
                const o = catalog.get(m[1]);
                if (!o) return err(404, "INVALID_REQUEST_ERROR", "NOT_FOUND", "Object not found");
                catalog.delete(m[1]);
                return send(200, { deleted_object_ids: [m[1], ...(o.item_data?.variations ?? []).map((v) => v.id)] });
            }
            return err(404, "INVALID_REQUEST_ERROR", "NOT_FOUND", `Resource not found: ${p}`);
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { SQUARE_API_URL: `http://127.0.0.1:${port}`, SQUARE_ACCESS_TOKEN: TOKEN },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.payments) return "the Square stand-in took no payment";
            if (!stats.cursors) return "the Square stand-in was never asked for a second page";
            if (!stats.rateLimited || !stats.retriedWithSameKey) return "the Square stand-in saw no retry with the same key after RATE_LIMITED";
            if (stats.noVersion) return "a request came without Square-Version";
            return null;
        },
    };
}
