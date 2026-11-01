// A Paddle Billing API for the paddle plugin's test, written from developer.paddle.com's reference:
// Bearer key, the { data, meta: { request_id, pagination: { per_page, next, has_more,
// estimated_total } } } envelope, /prices, /transactions and /subscriptions with `after` paging
// (per_page at most 200), whole next links, POST /subscriptions/:id/cancel, pause, resume,
// PATCH /subscriptions/:id needing proration_billing_mode with items, and errors as { error: { type,
// code, detail, documentation_url, errors: [{ field, message }] }, meta }. Unit prices are text in
// the lowest denomination. A transaction is draft without a customer and address, ready with them.
// A first read of pri_busy gets a 429 with Retry-After.
//
//   start({ port }) -> { env: { PADDLE_API_URL, PADDLE_API_KEY }, close(), check() }
import { createServer } from "node:http";

const KEY = "qk_test_paddle";

export async function start({ port }) {
    const base = `http://127.0.0.1:${port}`;
    const stats = { next: 0, limited: 0, tooBig: 0, created: 0 };
    const prices = new Map(), transactions = new Map(), subs = new Map();
    let n = 100;
    const id = (p) => `${p}_01${(++n).toString(36).padStart(10, "h")}`;
    prices.set("pri_seed", { id: "pri_seed", product_id: "pro_01mug", description: "Mug", status: "active", unit_price: { amount: "1250", currency_code: "EUR" }, billing_cycle: null });
    prices.set("pri_busy", { id: "pri_busy", product_id: "pro_01mug", description: "Busy", status: "active", unit_price: { amount: "100", currency_code: "EUR" }, billing_cycle: null });
    for (let i = 0; i < 450; i++) { const k = id("pri"); prices.set(k, { id: k, product_id: "pro_01mug", description: `P${i}`, status: "active", unit_price: { amount: "100", currency_code: "USD" }, billing_cycle: null }); }
    for (let i = 0; i < 210; i++) { const k = id("txn"); transactions.set(k, { id: k, status: "completed", currency_code: "USD", items: [], details: { totals: { total: "100" } } }); }
    subs.set("sub_seed", { id: "sub_seed", status: "active", items: [{ price: { id: "pri_seed" }, quantity: 1 }], custom_data: null, scheduled_change: null });
    for (let i = 0; i < 205; i++) { const k = id("sub"); subs.set(k, { id: k, status: "active", items: [], custom_data: null, scheduled_change: null }); }
    const request_id = () => `req_${(++n).toString(36)}`;
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, data, extra = {}) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify({ data, meta: { request_id: request_id(), ...extra } })); };
            const fail = (code, ecode, detail, errors, headers = {}) => { res.writeHead(code, { "content-type": "application/json", ...headers }); res.end(JSON.stringify({ error: { type: code >= 500 ? "api_error" : "request_error", code: ecode, detail, documentation_url: `https://developer.paddle.com/errors/shared/${ecode}`, ...(errors ? { errors } : {}) }, meta: { request_id: "req_fixed" } })); };
            if (req.headers.authorization !== `Bearer ${KEY}`) return fail(403, "forbidden", "You aren't permitted to perform this request.");
            if (req.headers["paddle-version"] !== "1") return fail(400, "bad_request", "Invalid Paddle-Version header.");
            const url = new URL(req.url, "http://x");
            const p = url.pathname, q = url.searchParams;
            const b = body ? JSON.parse(body) : {};
            let m;
            const list = (all) => {
                const per = Number(q.get("per_page") ?? 50);
                if (per > 200) { stats.tooBig++; return fail(400, "bad_request", "Invalid request.", [{ field: "per_page", message: "must be 200 or less" }]); }
                const after = q.get("after");
                if (after) stats.next++;
                const at = after ? all.findIndex((x) => x.id === after) + 1 : 0;
                const slice = all.slice(at, at + per);
                const more = at + per < all.length;
                const carry = [...q.entries()].filter(([k]) => k !== "after").map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
                send(200, slice, { pagination: { per_page: per, next: `${base}${p}?after=${slice.at(-1)?.id}&${carry}`, has_more: more, estimated_total: all.length } });
            };
            const status = (m2, all) => { const s = q.get("status"); return s ? all.filter((x) => s.split(",").includes(x.status)) : all; };
            if (req.method === "POST" && p === "/prices") {
                if (b.product_id !== "pro_01mug") return fail(400, "bad_request", "Invalid request.", [{ field: "product_id", message: "product does not exist" }]);
                if (typeof b.unit_price?.amount !== "string") return fail(400, "bad_request", "Invalid request.", [{ field: "unit_price.amount", message: "must be a string" }]);
                const pr = { id: id("pri"), status: "active", billing_cycle: null, ...b };
                prices.set(pr.id, pr); stats.created++;
                return send(201, pr);
            }
            if (req.method === "GET" && p === "/prices") return list(status(null, [...prices.values()]));
            if (m = /^\/prices\/([^/]+)$/.exec(p)) {
                if (m[1] === "pri_busy" && !stats.limited) { stats.limited++; return fail(429, "too_many_requests", "IP address exceeded the allowed rate limit.", null, { "retry-after": "1" }); }
                const pr = prices.get(m[1]);
                if (!pr) return fail(404, "not_found", "Entity not found.");
                if (req.method === "PATCH") Object.assign(pr, b);
                return send(200, pr);
            }
            if (req.method === "POST" && p === "/transactions") {
                let total = 0, currency = "USD";
                const errors = [];
                (b.items ?? []).forEach((it, i) => { const pr = prices.get(it.price_id); if (!pr) errors.push({ field: `items[${i}].price_id`, message: "price not found" }); else { total += Number(pr.unit_price.amount) * it.quantity; currency = pr.unit_price.currency_code; } });
                if (errors.length) return fail(400, "bad_request", "Invalid request.", errors);
                const t = { id: id("txn"), status: b.customer_id && b.address_id ? "ready" : "draft", currency_code: currency, custom_data: b.custom_data ?? null, items: b.items, details: { totals: { total: String(total) } } };
                transactions.set(t.id, t); stats.created++;
                return send(201, t);
            }
            if (req.method === "GET" && p === "/transactions") return list(status(null, [...transactions.values()]));
            if (m = /^\/transactions\/([^/]+)$/.exec(p)) return transactions.has(m[1]) ? send(200, transactions.get(m[1])) : fail(404, "not_found", "Entity not found.");
            if (req.method === "GET" && p === "/subscriptions") return list(status(null, [...subs.values()]));
            if (m = /^\/subscriptions\/([^/]+)(?:\/(cancel|pause|resume))?$/.exec(p)) {
                if (m[1] === "sub_forbidden") return fail(403, "forbidden", "You aren't permitted to perform this request.");
                const s = subs.get(m[1]);
                if (!s) return fail(404, "not_found", "Entity not found.");
                if (req.method === "PATCH") {
                    if (b.items && !b.proration_billing_mode) return fail(400, "bad_request", "Invalid request.", [{ field: "proration_billing_mode", message: "required when items change" }]);
                    if (b.items) s.items = b.items.map((i) => ({ price: { id: i.price_id }, quantity: i.quantity }));
                    if ("custom_data" in b) s.custom_data = b.custom_data;
                }
                if (m[2] === "cancel") { if (b.effective_from === "immediately") s.status = "canceled"; else s.scheduled_change = { action: "cancel", effective_at: "2026-12-01T00:00:00Z" }; }
                if (m[2] === "pause") { if (b.effective_from === "immediately") s.status = "paused"; else s.scheduled_change = { action: "pause", effective_at: "2026-12-01T00:00:00Z" }; }
                if (m[2] === "resume") { if (s.status !== "paused") return fail(400, "subscription_is_not_paused", "Only paused subscriptions can be resumed."); s.status = "active"; }
                return send(200, s);
            }
            return fail(404, "not_found", "Entity not found.");
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { PADDLE_API_URL: base, PADDLE_API_KEY: KEY },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.created) return "the Paddle stand-in made nothing";
            if (!stats.next) return "the Paddle stand-in was never asked for a second page";
            if (!stats.limited) return "the Paddle stand-in never saw a retry after a 429";
            if (stats.tooBig) return "a list asked for more than 200 a page";
            return null;
        },
    };
}
